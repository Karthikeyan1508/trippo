"use server"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import {
  researchTrip,
  fetchPlaceImages,
  type PlaceLite,
} from "@/server/serpapi"
import { narrateTrip } from "@/server/groq"
import { activityIconKey } from "@/lib/trip-icons"

export type StoryScene = {
  n: number
  dayNumber: number
  dayTitle: string | null
  time: string | null
  category: string
  iconKey: string
  title: string
  placeName: string | null
  lat: number
  lng: number
  photoUrl: string | null
  images: string[]
  rating: number | null
  sourceUrl: string | null
  narration: string
}

export type TripStory =
  | {
      ok: true
      destination: string
      tripName: string
      intro: string
      outro: string
      scenes: StoryScene[]
      route: [number, number][] | null
      narrated: boolean
    }
  | { ok: false; error: string }

/** Road-following polyline through the stops (OSRM public API); null on failure. */
async function fetchRoute(
  coords: [number, number][]
): Promise<[number, number][] | null> {
  if (coords.length < 2) return null
  try {
    const path = coords.map((c) => `${c[0]},${c[1]}`).join(";")
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`,
      { cache: "no-store" }
    )
    if (!res.ok) return null
    const json = await res.json()
    const line = json?.routes?.[0]?.geometry?.coordinates
    return Array.isArray(line) ? (line as [number, number][]) : null
  } catch {
    return null
  }
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

function findThumb(name: string | null, pool: PlaceLite[]): string | null {
  if (!name) return null
  const n = name.toLowerCase()
  const hit = pool.find(
    (p) =>
      p.thumbnail &&
      (p.title.toLowerCase().includes(n) || n.includes(p.title.toLowerCase()))
  )
  return hit?.thumbnail ?? null
}

export async function getTripStory(tripId: string): Promise<TripStory> {
  const user = await requireUser()

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      members: { include: { preference: true } },
      itineraries: {
        orderBy: { generatedAt: "desc" },
        take: 1,
        include: {
          days: {
            orderBy: { dayNumber: "asc" },
            include: { items: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  })
  if (!trip) return { ok: false, error: "Trip not found." }
  if (!trip.members.some((m) => m.userId === user.id)) {
    return { ok: false, error: "You're not a member of this trip." }
  }
  const itinerary = trip.itineraries[0]
  if (!itinerary) {
    return { ok: false, error: "Generate an itinerary first." }
  }

  // Located stops become scenes.
  const raw: Omit<
    StoryScene,
    "n" | "photoUrl" | "narration" | "images" | "iconKey"
  >[] = []
  for (const d of itinerary.days) {
    for (const it of d.items) {
      if (it.lat != null && it.lng != null) {
        raw.push({
          dayNumber: d.dayNumber,
          dayTitle: d.title,
          time: it.startTime,
          category: it.category,
          title: it.title,
          placeName: it.placeName,
          lat: it.lat,
          lng: it.lng,
          rating: it.rating,
          sourceUrl: it.sourceUrl,
        })
      }
    }
  }
  if (raw.length === 0) {
    return { ok: false, error: "This plan has no located stops to map yet." }
  }

  // Photos from the already-cached SerpApi research (no extra credits).
  const prefs = trip.members
    .map((m) => m.preference)
    .filter((p): p is NonNullable<typeof p> => p !== null)
  const vegHeavy =
    prefs.filter((p) => p.diet === "VEG").length >
    prefs.filter((p) => p.diet === "NON_VEG").length
  const research = await researchTrip({
    tripId,
    destination: trip.destination,
    checkIn: iso(trip.startDate),
    checkOut: iso(trip.endDate),
    dietQuery: vegHeavy ? "vegetarian" : "",
  })
  const pool = [...research.attractions, ...research.restaurants]

  const days = Math.max(
    1,
    Math.round(
      (trip.endDate.getTime() - trip.startDate.getTime()) / 86_400_000
    ) + 1
  )

  // Narration (Groq, with a plain fallback).
  const narration = await narrateTrip({
    destination: trip.destination,
    days,
    tripType: trip.tripType,
    scenes: raw.map((s) => ({
      day: s.dayNumber,
      title: s.title,
      placeName: s.placeName,
      time: s.time,
      category: s.category,
    })),
  })

  // A few photos per unique place (cached; deduped so repeats don't re-fetch).
  const uniquePlaces = [...new Set(raw.map((s) => s.placeName ?? s.title))]
  const imagesByPlace = new Map<string, string[]>()
  await Promise.all(
    uniquePlaces.map(async (place) => {
      const imgs = await fetchPlaceImages(tripId, `${place} ${trip.destination}`)
      imagesByPlace.set(place, imgs)
    })
  )

  // Road-following route through all stops (like driving directions).
  const route = await fetchRoute(
    raw.map((s) => [s.lng, s.lat] as [number, number])
  )

  const fallbackLine = (s: (typeof raw)[number]) =>
    `${s.title}${
      s.placeName && s.placeName !== s.title ? `, ${s.placeName}` : ""
    }.`

  const scenes: StoryScene[] = raw.map((s, i) => {
    const key = s.placeName ?? s.title
    const thumb = findThumb(s.placeName ?? s.title, pool)
    let images = imagesByPlace.get(key) ?? []
    if (images.length === 0 && thumb) images = [thumb]
    return {
      ...s,
      n: i + 1,
      iconKey: activityIconKey(s.category, s.title),
      photoUrl: thumb ?? images[0] ?? null,
      images,
      narration: narration?.lines?.[i]?.trim() || fallbackLine(s),
    }
  })

  return {
    ok: true,
    destination: trip.destination,
    tripName: trip.name,
    intro:
      narration?.intro?.trim() ||
      `Your ${days}-day trip to ${trip.destination}, one stop at a time.`,
    outro:
      narration?.outro?.trim() ||
      `That's a wrap on ${trip.destination}. What a trip!`,
    scenes,
    route,
    narrated: narration !== null,
  }
}
