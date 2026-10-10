"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { rateLimit } from "@/lib/rate-limit"
import { notify, personName } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"
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

export type StoryData = {
  destination: string
  tripName: string
  intro: string
  outro: string
  scenes: StoryScene[]
  route: [number, number][] | null
  narrated: boolean
}

type Built = ({ ok: true } & StoryData) | { ok: false; error: string }

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

/** Researches, narrates and maps the trip. Expensive, so it only runs from generateTripStory. */
async function buildStory(tripId: string, userId: string): Promise<Built> {

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
  if (!trip.members.some((m) => m.userId === userId)) {
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

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

async function adminOf(tripId: string) {
  const user = await requireUser()
  const member = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId: user.id } } })
  return { user, member }
}

/**
 * Builds the trip's story and keeps it. Admins only, and only once: after that the saved
 * story is what everyone watches, so nothing here is ever spent twice.
 */
export async function generateTripStory(tripId: string): Promise<ActionResult<{ story: StoryData }>> {
  const { user, member } = await adminOf(tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  if (member.role !== "ADMIN") return { ok: false, error: "Only an admin can create the story." }
  if (await prisma.tripStory.findUnique({ where: { tripId }, select: { id: true } })) {
    return { ok: false, error: "This trip's story has already been created." }
  }

  const built = await buildStory(tripId, user.id)
  if (!built.ok) return built
  const { ok: _ok, ...data } = built
  void _ok
  try {
    await prisma.tripStory.create({ data: { tripId, data: data as unknown as Prisma.InputJsonValue, generatedById: user.id } })
  } catch {
    // Two admins pressed the button together: the first one's story stands.
    return { ok: false, error: "This trip's story has already been created." }
  }
  revalidatePath(`/trips/${tripId}`)
  return { ok: true, story: data }
}

/** Turns the public link on (making one if needed) or off. Admins only; shares only this story. */
export async function setStorySharing(tripId: string, enabled: boolean): Promise<ActionResult<{ shareToken: string | null }>> {
  const { member } = await adminOf(tripId)
  if (!member || member.role !== "ADMIN") return { ok: false, error: "Only an admin can share the story." }
  const story = await prisma.tripStory.findUnique({ where: { tripId } })
  if (!story) return { ok: false, error: "Create the story first." }
  if (!enabled) {
    await prisma.tripStory.update({ where: { tripId }, data: { shareToken: null, sharedAt: null } })
    revalidatePath(`/trips/${tripId}`)
    return { ok: true, shareToken: null }
  }
  const shareToken = story.shareToken ?? randomBytes(18).toString("base64url")
  await prisma.tripStory.update({ where: { tripId }, data: { shareToken, sharedAt: story.sharedAt ?? new Date() } })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true, shareToken }
}

/** A crew member asks the admins to create the story. They are told; nothing is built until one of them does. */
export async function requestTripStory(tripId: string): Promise<ActionResult> {
  const { user, member } = await adminOf(tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  if (member.role === "ADMIN") return { ok: false, error: "You can create the story yourself." }
  if (await prisma.tripStory.findUnique({ where: { tripId }, select: { id: true } })) {
    return { ok: false, error: "The story has already been created." }
  }
  const limited = rateLimit(`story-request:${tripId}:${user.id}`, 1, 6 * 60 * 60 * 1000)
  if (!limited.ok) return { ok: true }
  await notify({
    tripId,
    actorId: user.id,
    to: "admins",
    type: "story_requested",
    title: `${personName(user)} asked for the trip story`,
    body: "Open the Story tab to create it",
    url: tripUrl(tripId, "story"),
    dedupe: false,
  })
  return { ok: true }
}
