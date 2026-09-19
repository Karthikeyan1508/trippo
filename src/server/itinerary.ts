"use server"

import { revalidatePath } from "next/cache"
import { addDays } from "date-fns"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { researchTrip, type ResearchBundle, type PlaceLite } from "@/server/serpapi"
import {
  generateItineraryWithGroq,
  hasGroq,
  type GeneratedItinerary,
  type ItineraryContext,
} from "@/server/groq"

type ItemCategoryT =
  | "TRAVEL"
  | "STAY"
  | "FOOD"
  | "ACTIVITY"
  | "SHOPPING"
  | "EVENT"
  | "OTHER"

type ActionResult =
  | { ok: true; source: string }
  | { ok: false; error: string }

function tally(values: (string | null | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const v of values) {
    if (!v) continue
    out[v] = (out[v] ?? 0) + 1
  }
  return out
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Generate (or regenerate) the AI itinerary for a trip. Admin only. */
export async function generateItinerary(tripId: string): Promise<ActionResult> {
  const user = await requireUser()

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { members: { include: { preference: true } } },
  })
  if (!trip) return { ok: false, error: "Trip not found." }

  const me = trip.members.find((m) => m.userId === user.id)
  if (!me || me.role !== "ADMIN") {
    return { ok: false, error: "Only the trip admin can generate the plan." }
  }

  const prefs = trip.members
    .map((m) => m.preference)
    .filter((p): p is NonNullable<typeof p> => p !== null)

  const diet = tally(prefs.map((p) => p.diet))
  const pace = tally(prefs.map((p) => p.pace))
  const interests = tally(prefs.flatMap((p) => p.interests))
  const stayTypes = tally(prefs.flatMap((p) => p.stayTypes))
  const mustCover = prefs
    .map((p) => p.mustCoverPlaces)
    .filter((s): s is string => !!s)
  const budgets = prefs
    .map((p) => p.budgetPerDay)
    .filter((b): b is number => typeof b === "number")
  const avgBudgetPerDay =
    budgets.length > 0
      ? Math.round(budgets.reduce((a, b) => a + b, 0) / budgets.length)
      : null

  const days = Math.max(
    1,
    Math.round(
      (trip.endDate.getTime() - trip.startDate.getTime()) / 86_400_000
    ) + 1
  )

  const vegHeavy = (diet.VEG ?? 0) > (diet.NON_VEG ?? 0)
  const dietQuery = vegHeavy ? "vegetarian" : ""

  // 1) SerpApi research (cached; empty if no key).
  const research = await researchTrip({
    tripId,
    destination: trip.destination,
    checkIn: iso(trip.startDate),
    checkOut: iso(trip.endDate),
    dietQuery,
  })

  const ctx: ItineraryContext = {
    destination: trip.destination,
    originCity: trip.originCity,
    startDate: iso(trip.startDate),
    endDate: iso(trip.endDate),
    days,
    tripType: trip.tripType,
    currency: trip.currency,
    budgetPerPerson: trip.budgetPerPerson,
    group: {
      memberCount: trip.members.length,
      diet,
      pace,
      interests,
      stayTypes,
      avgBudgetPerDay,
      mustCover,
    },
    research,
  }

  // 2) Groq reasoning → structured plan. Fall back to a deterministic sample.
  let plan = await generateItineraryWithGroq(ctx)
  const usedGroq = plan !== null
  if (!plan) plan = buildSampleItinerary(ctx)

  const source = usedGroq ? "AI" : "SAMPLE"
  const model = usedGroq
    ? process.env.GROQ_MODEL || "openai/gpt-oss-120b"
    : null

  // 3) Persist. Enrich items with coordinates/links from the research data.
  const existing = await prisma.itinerary.count({ where: { tripId } })

  await prisma.itinerary.create({
    data: {
      tripId,
      version: existing + 1,
      status: "DRAFT",
      source,
      model,
      summary: plan.summary,
      createdById: user.id,
      days: {
        create: plan.days.map((d) => ({
          dayNumber: d.dayNumber,
          date: addDays(trip.startDate, d.dayNumber - 1),
          title: d.title ?? null,
          summary: d.summary ?? null,
          items: {
            create: d.items.map((it, idx) => {
              const match = it.placeName
                ? matchPlace(it.placeName, research)
                : undefined
              return {
                order: idx,
                startTime: it.startTime ?? null,
                endTime: it.endTime ?? null,
                title: it.title,
                description: it.description ?? null,
                category: it.category as ItemCategoryT,
                placeName: it.placeName ?? null,
                address: match?.address ?? null,
                lat: match?.lat ?? null,
                lng: match?.lng ?? null,
                rating: match?.rating ?? null,
                sourceEngine: match ? match.engine : null,
                sourceUrl: match?.link ?? null,
                why: it.why ?? null,
              }
            }),
          },
        })),
      },
    },
  })

  revalidatePath(`/trips/${tripId}`)
  return { ok: true, source }
}

function matchPlace(
  name: string,
  research: ResearchBundle
): (PlaceLite & { engine: string }) | undefined {
  const n = name.toLowerCase()
  const pool: { place: PlaceLite; engine: string }[] = [
    ...research.attractions.map((p) => ({ place: p, engine: "google_maps" })),
    ...research.restaurants.map((p) => ({ place: p, engine: "google_local" })),
  ]
  const hit = pool.find(
    ({ place }) =>
      place.title.toLowerCase().includes(n) ||
      n.includes(place.title.toLowerCase())
  )
  return hit ? { ...hit.place, engine: hit.engine } : undefined
}

// ── Deterministic sample plan (used when Groq isn't configured) ─────────

function pick<T>(arr: T[], i: number): T | undefined {
  return arr.length ? arr[i % arr.length] : undefined
}

function buildSampleItinerary(ctx: ItineraryContext): GeneratedItinerary {
  const { destination, days, research } = ctx
  const attractions = research.attractions
  const restaurants = research.restaurants
  const interests = Object.keys(ctx.group.interests)
  const relaxed = (ctx.group.pace.RELAXED ?? 0) >= (ctx.group.pace.PACKED ?? 0)

  const noteData = research.available
    ? "Built from live SerpApi place data."
    : "Sample plan — add SerpApi & Groq keys for live, personalised data."

  const out: GeneratedItinerary["days"] = []
  let aIdx = 0
  let rIdx = 0

  for (let day = 1; day <= days; day++) {
    const items: GeneratedItinerary["days"][number]["items"] = []
    const isFirst = day === 1
    const isLast = day === days

    if (isFirst) {
      items.push({
        startTime: "10:00",
        title: `Arrive in ${destination}`,
        category: "TRAVEL",
        description: `Travel from ${ctx.originCity ?? "home"} and settle in.`,
        why: "Ease into the trip on day one.",
      })
      items.push({
        startTime: "13:00",
        title: "Check in & lunch",
        category: "STAY",
        placeName: pick(restaurants, rIdx++)?.title,
        why: "Drop bags and refuel before exploring.",
      })
    } else {
      items.push({
        startTime: "08:30",
        title: "Breakfast",
        category: "FOOD",
        placeName: pick(restaurants, rIdx++)?.title,
        why: ctx.group.diet.VEG ? "Veg-friendly start for the group." : "Fuel up for the day.",
      })
    }

    // Morning / afternoon activities
    const slots = relaxed ? 1 : 2
    for (let s = 0; s < slots; s++) {
      const place = pick(attractions, aIdx++)
      const interest = pick(interests, day + s)
      items.push({
        startTime: s === 0 ? "10:30" : "15:00",
        title: place?.title ?? `Explore ${interest ?? destination}`,
        category: "ACTIVITY",
        placeName: place?.title,
        description: place?.category,
        why: place?.rating
          ? `Highly rated (${place.rating}★) and matches the group's interests.`
          : `Picked for the group's interest in ${interest ?? "sightseeing"}.`,
      })
      if (s === 0) {
        items.push({
          startTime: "13:00",
          title: "Lunch",
          category: "FOOD",
          placeName: pick(restaurants, rIdx++)?.title,
          why: "Midday break near the morning stop.",
        })
      }
    }

    if (isLast) {
      items.push({
        startTime: "18:00",
        title: "Last-minute shopping",
        category: "SHOPPING",
        why: "Grab souvenirs before heading back.",
      })
      items.push({
        startTime: "20:00",
        title: `Depart ${destination}`,
        category: "TRAVEL",
        why: "Wrap up and travel home.",
      })
    } else {
      const nightlife = interests.includes("Nightlife") || interests.includes("Pubs")
      items.push({
        startTime: "20:00",
        title: nightlife ? "Dinner & nightlife" : "Dinner",
        category: nightlife ? "EVENT" : "FOOD",
        placeName: pick(restaurants, rIdx++)?.title,
        why: nightlife
          ? "The group is up for nightlife."
          : "Relaxed group dinner.",
      })
    }

    out.push({
      dayNumber: day,
      title: isFirst
        ? "Arrival & first bites"
        : isLast
          ? "Last day & departure"
          : `Exploring ${destination}`,
      summary: undefined,
      items,
    })
  }

  return {
    summary: `A ${days}-day plan for ${destination}. ${noteData}`,
    days: out,
  }
}
