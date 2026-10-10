import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { syncPlanState } from "@/lib/plan-state"
import { notify } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"
import { formatMinutes, type HotelItem, type PlaceItem, type TransportItem } from "@/lib/chat"

/**
 * Changes to the itinerary that come from elsewhere than the editor: a hotel, a
 * transport leg or a place that the crew chose in chat. Kept out of the "use server"
 * action files because these are plain helpers the actions share.
 */

type Actor = { id: string; name?: string | null; email?: string | null }

/**
 * Any change to the plan invalidates the group's votes: nobody should stay
 * "approved" on a plan that changed under them.
 */
export async function afterPlanChange(tripId: string, itineraryId: string, actor: Actor, opts?: { push?: boolean }) {
  const cleared = await prisma.approval.deleteMany({ where: { itineraryId } })
  await syncPlanState(tripId)
  if (cleared.count > 0) {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { name: true } })
    await notify({
      tripId,
      actorId: actor.id,
      to: "voters",
      push: opts?.push,
      type: "plan_changed",
      title: "The plan changed. Please vote again",
      body: trip?.name,
      url: tripUrl(tripId, "itinerary"),
    })
  }
  revalidatePath(`/trips/${tripId}`)
  return { votesReset: cleared.count > 0 }
}

export type PlanAddition =
  | { kind: "hotel"; item: HotelItem }
  | { kind: "transport"; item: TransportItem; from?: string; to?: string }
  | { kind: "place"; item: PlaceItem }

export type AddResult =
  | { ok: true; mode: "added"; dayNumber: number; title: string; votesReset: boolean }
  | { ok: true; mode: "stay_saved"; title: string }
  | { ok: false; error: string }

/** "3:00 PM" to "15:00"; anything unreadable gives undefined. */
function to24h(clock?: string): string | undefined {
  const m = clock?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!m) return undefined
  let h = Number(m[1])
  if (/pm/i.test(m[3] ?? "") && h < 12) h += 12
  if (/am/i.test(m[3] ?? "") && h === 12) h = 0
  if (h > 23) return undefined
  return `${String(h).padStart(2, "0")}:${m[2]}`
}

const validTime = (t?: string | null) => (t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : undefined)

/** The group's chosen stay: what regenerating the plan keeps building around. */
async function saveStay(tripId: string, hotel: HotelItem) {
  const existing = await prisma.stayOption.findFirst({ where: { tripId, name: hotel.name } })
  await prisma.stayOption.updateMany({ where: { tripId }, data: { selected: false } })
  const data = {
    price: hotel.priceNight ?? null,
    rating: hotel.rating ?? null,
    type: "hotel",
    amenities: hotel.amenities,
    link: hotel.link ?? null,
    thumbnail: hotel.image ?? null,
    selected: true,
  }
  if (existing) await prisma.stayOption.update({ where: { id: existing.id }, data })
  else await prisma.stayOption.create({ data: { tripId, name: hotel.name, ...data } })
}

/** Hotel names from Google often carry a tagline ("VAUX Park Street Hotel - A collection of..."). */
function shortName(name: string) {
  const head = name.split(/\s+[-|:]\s+|\s*\(/)[0].trim()
  return (head.length >= 4 ? head : name).slice(0, 60)
}

function fields(addition: PlanAddition, note?: string | null) {
  if (addition.kind === "hotel") {
    const h = addition.item
    return {
      title: `Check in at ${shortName(h.name)}`,
      category: "STAY" as const,
      startTime: to24h(h.checkIn) ?? "14:00",
      description:
        [h.priceNight ? `${h.priceNight} per night` : null, h.rating ? `${h.rating} rating` : null, h.distanceKm !== undefined ? `${h.distanceKm} km from the centre` : null]
          .filter(Boolean)
          .join(", ") || undefined,
      placeName: h.name,
      lat: h.lat,
      lng: h.lng,
      rating: h.rating,
      sourceEngine: "google_hotels",
      sourceUrl: h.link,
      why: note || h.why || "Chosen by the crew in chat",
    }
  }
  if (addition.kind === "transport") {
    const t = addition.item
    const route = addition.from && addition.to ? `${addition.from} to ${addition.to}` : ""
    return {
      title: [t.title, route].filter(Boolean).join(": "),
      category: "TRAVEL" as const,
      startTime: to24h(t.departs),
      description:
        [
          t.durationMin ? formatMinutes(t.durationMin) : null,
          t.distanceKm ? `${t.distanceKm} km` : null,
          t.operator ?? null,
          t.cost ? `fare ${t.cost}` : null,
          t.fromStop && t.toStop ? `${t.fromStop} to ${t.toStop}` : null,
        ]
          .filter(Boolean)
          .join(", ") || undefined,
      placeName: undefined,
      lat: undefined,
      lng: undefined,
      rating: undefined,
      sourceEngine: t.source === "Web" ? undefined : "google_maps_directions",
      sourceUrl: t.link,
      why: note || "Chosen by the crew in chat",
    }
  }
  const p = addition.item
  const food = /restaurant|cafe|coffee|bakery|bar|food|eatery|diner/i.test(p.category ?? "")
  return {
    title: p.name,
    category: food ? ("FOOD" as const) : ("ACTIVITY" as const),
    startTime: undefined,
    description: [p.category, p.price, p.hours].filter(Boolean).join(", ") || undefined,
    placeName: p.name,
    lat: p.lat,
    lng: p.lng,
    rating: p.rating,
    sourceEngine: "google_maps",
    sourceUrl: p.link,
    why: note || p.why || "Chosen by the crew in chat",
  }
}

/**
 * Puts a suggestion into the latest itinerary on the chosen day, in time order. With no
 * plan yet, a hotel becomes the group's chosen stay (the plan is built around it) and
 * anything else asks for a plan first. Returns what happened, for the chat notice.
 */
export async function addToItinerary(
  tripId: string,
  actor: Actor,
  addition: PlanAddition,
  opts: { dayNumber?: number | null; startTime?: string | null; note?: string | null }
): Promise<AddResult> {
  const itinerary = await prisma.itinerary.findFirst({
    where: { tripId },
    orderBy: { generatedAt: "desc" },
    include: { days: { orderBy: { dayNumber: "asc" }, include: { items: { orderBy: { order: "asc" } } } } },
  })

  if (addition.kind === "hotel") await saveStay(tripId, addition.item)

  if (!itinerary) {
    if (addition.kind === "hotel") return { ok: true, mode: "stay_saved", title: addition.item.name }
    return { ok: false, error: "There is no itinerary yet. Generate the plan first, then add this to a day." }
  }

  const wanted = opts.dayNumber ?? 1
  const day = itinerary.days.find((d) => d.dayNumber === wanted) ?? itinerary.days[0]
  if (!day) return { ok: false, error: "The itinerary has no days to add this to." }

  const f = fields(addition, opts.note?.trim().slice(0, 200))
  const startTime = validTime(opts.startTime) ?? f.startTime

  // Slot it in by time when it has one; otherwise it goes at the end.
  let index = day.items.length
  if (startTime) {
    const after = day.items.findIndex((i) => i.startTime && i.startTime > startTime)
    if (after !== -1) index = after
  }

  await prisma.itineraryItem.create({
    data: {
      dayId: day.id,
      order: index,
      title: f.title.slice(0, 120),
      category: f.category,
      startTime: startTime ?? null,
      description: f.description?.slice(0, 300) ?? null,
      placeName: f.placeName ?? null,
      lat: f.lat ?? null,
      lng: f.lng ?? null,
      rating: f.rating ?? null,
      sourceEngine: f.sourceEngine ?? null,
      sourceUrl: f.sourceUrl ?? null,
      why: f.why?.slice(0, 200) ?? null,
    },
  })
  // The new row already sits at `index`; only the items after it need a new number.
  const moves = day.items
    .map((item, position) => ({ id: item.id, from: item.order, to: position < index ? position : position + 1 }))
    .filter((m) => m.from !== m.to)
  if (moves.length > 0) {
    await prisma.$transaction(moves.map((m) => prisma.itineraryItem.update({ where: { id: m.id }, data: { order: m.to } })))
  }

  const { votesReset } = await afterPlanChange(tripId, itinerary.id, actor, { push: false })
  return { ok: true, mode: "added", dayNumber: day.dayNumber, title: f.title, votesReset }
}
