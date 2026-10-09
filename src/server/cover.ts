import { prisma } from "@/lib/prisma"
import { safeHttpUrl } from "@/lib/safe-url"
import { fetchPlaceImages } from "@/server/serpapi"

type CoverTarget = { id: string; destination: string; coverImage: string | null }

/**
 * Looks up a destination photo for one trip and stores it, once.
 * Returns the URL ("" when nothing usable was found). Never throws: a missing
 * photo just means the card falls back to its gradient.
 */
async function fetchCover(trip: CoverTarget): Promise<string> {
  try {
    const images = await fetchPlaceImages(trip.id, `${trip.destination} travel photography`)
    const url = images.map(safeHttpUrl).find(Boolean) ?? ""
    await prisma.trip.update({ where: { id: trip.id }, data: { coverImage: url } })
    return url
  } catch (error) {
    console.error("Cover lookup failed:", error)
    return ""
  }
}

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms))
}

/**
 * Fills in missing cover photos for the given trips and returns a
 * `tripId → url` map. Waits at most `waitMs` so a slow lookup can never hold
 * up the page; a lookup that outlives the wait still finishes and saves, so
 * the photo simply appears on the next visit.
 */
export async function resolveCovers(trips: CoverTarget[], waitMs = 3000) {
  const covers = new Map<string, string>()
  const missing: CoverTarget[] = []

  for (const trip of trips) {
    if (trip.coverImage !== null) covers.set(trip.id, trip.coverImage)
    else missing.push(trip)
  }

  if (missing.length > 0 && process.env.SERPAPI_API_KEY) {
    const found = await Promise.all(
      missing.map((trip) => Promise.race([fetchCover(trip), timeout(waitMs)]))
    )
    missing.forEach((trip, i) => covers.set(trip.id, found[i] ?? ""))
  }

  return covers
}
