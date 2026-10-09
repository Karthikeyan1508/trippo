import { driveMinutes, fromMinutes, roundUp15, toMinutes } from "@/lib/geo"
import {
  generateItineraryWithGroq,
  type GeneratedDay,
  type GeneratedItem,
  type GeneratedItinerary,
  type ItineraryContext,
} from "@/server/groq"
import type { DayPlan, RoutedPlace, RoutePlan } from "@/server/route-planner"

/**
 * Turns a fixed route into the final days: the model's wording on top of
 * the planner's structure. The route is never negotiable. Whatever the model
 * returns is checked against it, and anything that breaks it is dropped.
 */

const norm = (s: string | undefined | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

function geoOf(p: RoutedPlace, engine: string): NonNullable<GeneratedItem["geo"]> {
  return { lat: p.lat, lng: p.lng, address: p.address, rating: p.rating, engine, url: p.link }
}

function findPlace(name: string | undefined, pool: RoutedPlace[]): RoutedPlace | undefined {
  const n = norm(name)
  if (!n) return undefined
  return pool.find((p) => {
    const t = norm(p.title)
    return t === n || t.includes(n) || n.includes(t)
  })
}

const MEAL_SLOTS = [
  { title: "Breakfast", at: 8 * 60 + 30, why: "A proper start before the day's stops." },
  { title: "Lunch", at: 13 * 60, why: "A midday break close to the morning's stops." },
  { title: "Dinner", at: 19 * 60 + 30, why: "An easy group dinner to end the day." },
]

/** A complete, sensible day made only from the plan: used when the model is unavailable or fails a day. */
function deterministicFreeItems(day: DayPlan): GeneratedItem[] {
  const items: GeneratedItem[] = []
  const from = toMinutes(day.window.from)
  const to = toMinutes(day.window.to)
  const eatenAt = new Set<string>()
  const eat = (slot: (typeof MEAL_SLOTS)[number], at: number) => {
    if (eatenAt.has(slot.title)) return
    eatenAt.add(slot.title)
    const spot = day.restaurants[eatenAt.size % Math.max(1, day.restaurants.length)]
    items.push({
      startTime: fromMinutes(at),
      title: slot.title,
      category: "FOOD",
      placeName: spot?.title,
      description: spot ? `Eat at ${spot.title}.` : `Somewhere local near ${day.base ?? "your stop"}.`,
      why: slot.why,
      geo: spot ? geoOf(spot, "google_local") : undefined,
    })
  }

  if (from <= 9 * 60 + 15) eat(MEAL_SLOTS[0], Math.max(from, MEAL_SLOTS[0].at))

  let cursor = from
  for (const stop of day.candidates) {
    cursor += driveMinutes(stop.kmFromPrev)
    // Lunch slots in naturally around midday.
    if (cursor >= 12 * 60 + 30 && !eatenAt.has("Lunch") && cursor < 15 * 60) {
      eat(MEAL_SLOTS[1], roundUp15(cursor))
      cursor = roundUp15(cursor) + 60
    }
    items.push({
      startTime: fromMinutes(roundUp15(cursor)),
      endTime: fromMinutes(roundUp15(cursor) + 90),
      title: stop.title,
      category: "ACTIVITY",
      placeName: stop.title,
      description: stop.category,
      why: stop.rating
        ? `Rated ${stop.rating} and only ${stop.kmFromPrev} km from the previous stop.`
        : `Close to the previous stop (${stop.kmFromPrev} km), so there is little backtracking.`,
      geo: geoOf(stop, "google_maps"),
    })
    cursor = roundUp15(cursor) + 100
  }

  if (!eatenAt.has("Lunch") && to - from > 5 * 60 && from < 13 * 60) eat(MEAL_SLOTS[1], Math.max(from, MEAL_SLOTS[1].at))
  if (to >= 19 * 60 + 30) eat(MEAL_SLOTS[2], MEAL_SLOTS[2].at)
  return items
}

/** "Breakfast" at 13:45 is just wrong: name the meal for the hour it actually happens. */
function mealForHour(minutes: number): string | null {
  if (minutes < 11 * 60) return "Breakfast"
  if (minutes < 15 * 60 + 30) return "Lunch"
  if (minutes < 17 * 60 + 30) return null // a snack or coffee: leave whatever the model wrote
  return "Dinner"
}

function fixMealLabel(it: GeneratedItem): GeneratedItem {
  if (it.category !== "FOOD" || !it.startTime) return it
  const match = it.title.match(/^(Early |Late |Farewell )?(Breakfast|Brunch|Lunch|Dinner)/i)
  const right = mealForHour(toMinutes(it.startTime))
  if (!match || !right || match[2].toLowerCase() === right.toLowerCase()) return it
  return { ...it, title: it.title.replace(match[0], right) }
}

/** The model's items for one day, kept only where they respect the route. */
function vetModelDay(day: DayPlan, items: GeneratedItem[]): GeneratedItem[] {
  const from = toMinutes(day.window.from)
  const to = toMinutes(day.window.to)
  const attractions = day.candidates
  const kept: GeneratedItem[] = []

  for (const it of items) {
    if (it.category === "TRAVEL") continue // travel belongs to the planner
    const at = it.startTime ? toMinutes(it.startTime) : undefined
    if (at !== undefined && (at < from - 15 || at > to + 45)) continue

    if (it.category === "ACTIVITY" || it.category === "EVENT") {
      const hit = findPlace(it.placeName ?? it.title, attractions)
      if (!hit) continue // a place the planner did not choose
      kept.push({ ...it, placeName: hit.title, geo: geoOf(hit, "google_maps") })
      continue
    }
    const eatery = findPlace(it.placeName, day.restaurants)
    kept.push(
      fixMealLabel(eatery ? { ...it, placeName: eatery.title, geo: geoOf(eatery, "google_local") } : { ...it, placeName: undefined })
    )
  }

  // Keep the planner's stop order: re-deal the activity times in order.
  const order = new Map(attractions.map((c, i) => [norm(c.title), i]))
  const activities = kept
    .filter((it) => it.category === "ACTIVITY" || it.category === "EVENT")
    .sort((a, b) => (order.get(norm(a.placeName)) ?? 99) - (order.get(norm(b.placeName)) ?? 99))
  const slots = activities
    .map((it) => it.startTime)
    .filter((t): t is string => Boolean(t))
    .sort()
  const ends = activities.map((it) => it.endTime)
  activities.forEach((it, i) => {
    it.startTime = slots[i] ?? it.startTime
    it.endTime = ends[i]
  })
  return kept
}

/** Drop free items that land on top of a flight or transfer. */
function clearOfFixed(day: DayPlan, items: GeneratedItem[]): GeneratedItem[] {
  return items.filter((it) => {
    if (!it.startTime) return true
    const t = toMinutes(it.startTime)
    return !day.fixed.some((f) => {
      const a = toMinutes(f.startTime)
      const b = f.endTime ? toMinutes(f.endTime) : a
      return t > a - 20 && t < b + 10
    })
  })
}

function stayItem(day: DayPlan, stayName?: string | null): GeneratedItem | null {
  const arrival = day.fixed.filter((f) => /^Transfer to |^Transfer .* to |^Drive .* to /.test(f.title) && f.category === "TRAVEL")
  const last = arrival[arrival.length - 1]
  if (!last) return null
  // Only on the days you actually change where you sleep (the airport run on the last day isn't one).
  if (/airport|Airport|International/.test(last.title) || /Drive back/.test(last.title)) return null
  const at = last.endTime ? toMinutes(last.endTime) : toMinutes(day.window.from) - 30
  return {
    startTime: fromMinutes(roundUp15(at)),
    title: stayName ? `Check in at ${stayName}` : `Check in and freshen up in ${day.base}`,
    category: "STAY",
    placeName: stayName ?? undefined,
    description: "Drop the bags, freshen up, and head out.",
    why: "Reset after the journey before the first stop.",
  }
}

/**
 * Orders the day and repairs the timings a model tends to get wrong: an item
 * that ends before it starts, or two free items on top of each other. Flights
 * and transfers never move; free items slide later to make room.
 */
function tidyTimes(fixed: GeneratedItem[], free: GeneratedItem[], day: DayPlan): GeneratedItem[] {
  const at = (it: GeneratedItem) => toMinutes(it.startTime ?? "23:59")
  const all = [...fixed.map((it) => ({ it, locked: true })), ...free.map((it) => ({ it, locked: false }))].sort(
    (a, b) => at(a.it) - at(b.it)
  )
  const limit = toMinutes(day.window.to) + 60
  const out: GeneratedItem[] = []
  let cursor = 0
  for (const { it, locked } of all) {
    const item = { ...it }
    if (!locked && item.startTime) {
      let start = at(item)
      const length = item.endTime ? Math.max(30, toMinutes(item.endTime) - start) : 60
      if (start < cursor) start = roundUp15(cursor)
      if (start > limit) continue
      item.startTime = fromMinutes(start)
      item.endTime = item.endTime ? fromMinutes(start + length) : undefined
    } else if (item.endTime && toMinutes(item.endTime) <= at(item)) {
      item.endTime = undefined
    }
    out.push(item)
    cursor = Math.max(cursor, item.endTime ? toMinutes(item.endTime) : at(item) + (locked ? 0 : 30))
  }
  return out
}

export async function buildRoutedItinerary(
  ctx: ItineraryContext,
  plan: RoutePlan
): Promise<{ itinerary: GeneratedItinerary; usedModel: boolean }> {
  const model = await generateItineraryWithGroq({ ...ctx, route: plan })
  const byDay = new Map<number, GeneratedDay>((model?.days ?? []).map((d) => [d.dayNumber, d]))

  const days: GeneratedDay[] = plan.days.map((day) => {
    const modelDay = byDay.get(day.day)
    const vetted = modelDay ? vetModelDay(day, modelDay.items) : []

    // If the model left a day without its stops, fall back to the planner's own version of that day.
    const hasStops = vetted.some((it) => it.category === "ACTIVITY")
    const free = modelDay && (hasStops || day.candidates.length === 0) ? vetted : deterministicFreeItems(day)

    const fixedItems: GeneratedItem[] = day.fixed.map((f) => ({
      startTime: f.startTime,
      endTime: f.endTime,
      title: f.title,
      description: f.description,
      category: f.category,
      placeName: f.placeName,
      why: f.why,
      geo: f.point
        ? { lat: f.point.lat, lng: f.point.lng, engine: f.engine, url: f.link }
        : undefined,
    }))

    const stay = stayItem(day, ctx.chosenStay?.name)
    const merged = tidyTimes(fixedItems, [...(stay ? [stay] : []), ...clearOfFixed(day, free)], day)

    return {
      dayNumber: day.day,
      title: day.title,
      summary: modelDay?.summary,
      items: merged,
    }
  })

  const flightLine =
    plan.mode === "flight" ? ` Flights both ways, planned so you land early and leave late.` : ""
  const distance =
    plan.totals.roadKm > 0 ? ` About ${plan.totals.roadKm} km on the road in total, ${plan.totals.transfers} transfer${plan.totals.transfers === 1 ? "" : "s"}.` : ""
  const skipped = plan.skipped.length > 0 ? ` Left out because it does not fit this route: ${plan.skipped.join("; ")}.` : ""

  return {
    usedModel: model !== null,
    itinerary: {
      summary: `${plan.headline}.${flightLine}${distance}${skipped}`.trim(),
      days,
    },
  }
}

