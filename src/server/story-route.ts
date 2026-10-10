import { haversineKm } from "@/lib/geo"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { StoryData } from "@/server/story"

type Pt = { lat: number; lng: number; category: string; title: string }

async function roadLeg(a: Pt, b: Pt): Promise<[number, number][] | null> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`,
      { cache: "no-store", signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return null
    const route = (await res.json())?.routes?.[0]
    const line = route?.geometry?.coordinates as [number, number][] | undefined
    if (!Array.isArray(line) || line.length < 2) return null
    // A road route that does not start and end at the stops (the stop is off the road network,
    // across water, ...) or that wanders far from a straight hop is not a real leg.
    const first = line[0]
    const last = line[line.length - 1]
    const near = (p: [number, number], q: Pt) => haversineKm({ lat: p[1], lng: p[0] }, q) <= 3
    const straight = haversineKm(a, b)
    if (!near(first, a) || !near(last, b)) return null
    if (route.distance / 1000 > straight * 3 + 5) return null
    return line
  } catch {
    return null
  }
}

/**
 * One line per hop between consecutive stops, so the route is always connected: a road line
 * where the public routing service finds one, a straight dashed line for flights and other
 * hops no road covers (or when the service is down).
 */
export async function buildLegs(points: Pt[]): Promise<{ coords: [number, number][]; mode: "road" | "direct" }[]> {
  const hops = points.slice(1).map((b, i) => ({ a: points[i], b }))
  const isFlight = (p: Pt) => p.category === "TRAVEL" && /flight|fly|airport/i.test(p.title)
  const legs: { coords: [number, number][]; mode: "road" | "direct" }[] = new Array(hops.length)
  let next = 0
  const worker = async () => {
    while (next < hops.length) {
      const i = next++
      const { a, b } = hops[i]
      const direct = { coords: [[a.lng, a.lat], [b.lng, b.lat]] as [number, number][], mode: "direct" as const }
      const km = haversineKm(a, b)
      if (km < 0.05) {
        legs[i] = direct
      } else if (km > 400 || isFlight(a) || isFlight(b)) {
        legs[i] = direct
      } else {
        const line = await roadLeg(a, b)
        legs[i] = line ? { coords: line, mode: "road" } : direct
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, hops.length) }, worker))
  return legs
}


/**
 * Stories made before routes were built hop by hop carry one road line through every stop, which
 * breaks at flights and sea crossings. The saved story stays as it is (it is never regenerated);
 * only its line is rebuilt, once, from the stops it already has, and saved back.
 */
export async function withConnectedRoute(tripId: string | null, story: StoryData): Promise<StoryData> {
  if ((story.legs && story.legs.length > 0) || story.scenes.length < 2) return story
  const legs = await buildLegs(story.scenes.map((s) => ({ lat: s.lat, lng: s.lng, category: s.category, title: s.title })))
  const upgraded: StoryData = { ...story, route: null, legs }
  if (tripId) {
    await prisma.tripStory
      .update({ where: { tripId }, data: { data: upgraded as unknown as Prisma.InputJsonValue } })
      .catch((error) => console.error("Story route upgrade not saved:", error))
  }
  return upgraded
}
