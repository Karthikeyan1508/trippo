import { addDays } from "date-fns"

import {
  bestOrder,
  driveMinutes,
  formatDuration,
  fromMinutes,
  haversineKm,
  pathKm,
  roadKm,
  roundUp15,
  toMinutes,
  type LatLng,
} from "@/lib/geo"
import { destinationRadiusKm, findAirport, nearestAirport, type Airport } from "@/lib/airports"
import {
  fetchAreaPlaces,
  fetchFlightOptions,
  geocodePlace,
  hasSerpApi,
  type FlightLite,
  type PlaceLite,
} from "@/server/serpapi"
import { hasGroq, proposeBasesWithGroq } from "@/server/groq"

/**
 * Builds the *shape* of a trip before any copywriting happens:
 *
 *   home -> (flight or road) -> gateway -> overnight bases -> gateway -> home
 *
 * Every number here comes from coordinates and real flight times, so the route
 * the LLM later dresses up is one a person could actually travel: short hops,
 * no backtracking, flights at believable times, and activity windows that
 * respect when you land and when you have to leave.
 */

export type Pace = "RELAXED" | "BALANCED" | "PACKED"

export type RouteInput = {
  tripId: string
  originCity: string | null
  destination: string
  startDate: string
  endDate: string
  days: number
  pace: Pace
  interests: string[]
  mustCover: string[]
  dietQuery: string
  chosenStayName?: string | null
}

export type RoutedPlace = PlaceLite & { lat: number; lng: number }

export type Base = {
  name: string
  point: LatLng
  nights: number
  why?: string
  attractions: RoutedPlace[]
  restaurants: RoutedPlace[]
}

export type FixedItem = {
  startTime: string
  endTime?: string
  title: string
  description: string
  category: "TRAVEL" | "STAY"
  placeName?: string
  point?: LatLng
  link?: string
  engine?: string
  why: string
}

export type DayPlan = {
  day: number
  date: string
  title: string
  base: string | null
  basePoint: LatLng | null
  window: { from: string; to: string }
  maxStops: number
  fixed: FixedItem[]
  candidates: (RoutedPlace & { kmFromPrev: number })[]
  restaurants: RoutedPlace[]
}

export type RoutePlan = {
  mode: "flight" | "road" | "none"
  originLabel: string | null
  gatewayLabel: string
  bases: Base[]
  days: DayPlan[]
  /** "Bengaluru → Colombo (flight) → ... → Bengaluru", for the summary line. */
  headline: string
  totals: { roadKm: number; transfers: number }
  /** Places the group asked for that are too far to fit this route. */
  skipped: string[]
}

const PACE_CAP: Record<Pace, number> = { RELAXED: 2, BALANCED: 3, PACKED: 4 }

const hasPoint = (p: PlaceLite): p is RoutedPlace =>
  typeof p.lat === "number" && typeof p.lng === "number"

const score = (p: PlaceLite) => (p.rating ?? 3.5) * Math.log10(10 + (p.reviews ?? 20))

/** Google often lists one spot twice (a beach and its park). Keep the better-rated of any two within 150 m or sharing a name. */
function dedupePlaces(sorted: RoutedPlace[]): RoutedPlace[] {
  const kept: RoutedPlace[] = []
  for (const p of sorted) {
    const name = p.title.toLowerCase()
    const twin = kept.some(
      (k) => haversineKm(k, p) < 0.15 || k.title.toLowerCase().includes(name) || name.includes(k.title.toLowerCase())
    )
    if (!twin) kept.push(p)
  }
  return kept
}

/** Door-to-door road minutes, with a small floor for getting in and out of a vehicle. */
function roadMinutes(a: LatLng, b: LatLng) {
  return driveMinutes(roadKm(a, b)) + 10
}

function maxBasesFor(days: number) {
  if (days <= 3) return 1
  if (days <= 5) return 2
  if (days <= 8) return 3
  return 4
}

// ── Flights ─────────────────────────────────────────────────────────────

function inRange(time: string, from: string, to: string) {
  const t = toMinutes(time)
  return t >= toMinutes(from) && t <= toMinutes(to)
}

/** Reasonably priced = within 30% of the cheapest option in the pool. */
function affordable(pool: FlightLite[]) {
  const prices = pool.map((f) => f.price).filter((p): p is number => typeof p === "number")
  if (prices.length === 0) return pool
  const cap = Math.min(...prices) * 1.3
  return pool.filter((f) => f.price === undefined || f.price <= cap)
}

/** Out: land early, so the first day is usable. Never overnight. */
function pickOutbound(options: FlightLite[]): FlightLite | undefined {
  const sameDay = options.filter((f) => f.arrivesNextDay === 0)
  const pool =
    sameDay.filter((f) => f.stops === 0 && inRange(f.departs, "05:00", "13:00")).length > 0
      ? sameDay.filter((f) => f.stops === 0 && inRange(f.departs, "05:00", "13:00"))
      : sameDay.filter((f) => f.stops <= 1 && inRange(f.departs, "05:00", "14:00"))
  const choices = affordable(pool.length > 0 ? pool : sameDay)
  return [...choices].sort((a, b) => toMinutes(a.arrives) - toMinutes(b.arrives))[0]
}

/** Back: leave late enough to use the last day, but prefer a direct flight and land the same night. */
function pickReturn(options: FlightLite[]): FlightLite | undefined {
  const sameDay = options.filter((f) => f.arrivesNextDay === 0)
  const direct = sameDay.filter((f) => f.stops === 0)
  const bands: FlightLite[][] = [
    direct.filter((f) => inRange(f.departs, "15:00", "22:30")),
    direct.filter((f) => inRange(f.departs, "11:00", "22:30")),
    sameDay.filter((f) => f.stops <= 1 && inRange(f.departs, "15:00", "22:30")),
    sameDay,
  ]
  const pool = bands.find((b) => b.length > 0) ?? []
  return [...affordable(pool)].sort((a, b) => toMinutes(b.departs) - toMinutes(a.departs))[0]
}

function flightTitle(f: Pick<FlightLite, "from" | "to">) {
  return `Flight ${f.from} to ${f.to}`
}

function flightDescription(f: FlightLite) {
  const bits = [
    [f.airline, f.flightNumber].filter(Boolean).join(" "),
    f.stops === 0 ? "non-stop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`,
    formatDuration(f.durationMin),
    f.price ? `about ₹${f.price.toLocaleString("en-IN")} per person` : null,
  ].filter(Boolean)
  return bits.join(" · ")
}

// ── Planning ────────────────────────────────────────────────────────────

export async function planRoute(input: RouteInput): Promise<RoutePlan | null> {
  const { tripId, originCity, destination, days } = input

  // 1. Where are we, where are we going, and how do we get there?
  const originAirportHint = findAirport(originCity)
  const originGeo = originCity ? await geocodePlace(tripId, originCity) : null
  const originPoint: LatLng | null = originGeo ?? originAirportHint ?? null

  const destAirportHint = findAirport(destination)
  const destGeo = await geocodePlace(tripId, destination)
  const destPoint: LatLng | null = destGeo ?? destAirportHint ?? null
  if (!destPoint) return null

  const originAirport: Airport | null = originPoint
    ? (originAirportHint ?? nearestAirport(originPoint))
    : null
  const destAirport: Airport = destAirportHint ?? nearestAirport(destPoint)

  let mode: RoutePlan["mode"] = "none"
  if (originPoint && originAirport) {
    const straight = haversineKm(originPoint, destPoint)
    const abroad = originAirport.country !== destAirport.country
    mode = abroad || straight > 500 ? "flight" : "road"
  }

  const originLabel = originCity ? (originAirport?.city ?? originCity) : null
  const gateway: { label: string; point: LatLng } =
    mode === "flight"
      ? { label: destAirport.city, point: destAirport }
      : mode === "road" && originPoint
        ? { label: originCity as string, point: originPoint }
        : { label: destination, point: destPoint }

  // 2. Overnight bases: proposed by the model, verified and re-ordered by geometry.
  const nights = Math.max(0, days - 1)
  const maxBases = maxBasesFor(days)
  // Short trips can't afford long drives: 3 days or fewer stay within about an hour and a half of the airport.
  const maxLegMinutes = days <= 3 ? 90 : days <= 5 ? 180 : 240
  const radiusKm = destinationRadiusKm(destination)

  let proposals: { name: string; nights: number; why?: string }[] = []
  if (hasGroq() && nights > 0) {
    proposals =
      (await proposeBasesWithGroq({
        destination,
        gatewayLabel: gateway.label,
        arrival: mode === "flight" ? "flight" : mode === "road" ? "road" : "none",
        days,
        nights,
        maxBases,
        maxLegMinutes,
        radiusKm,
        pace: input.pace,
        interests: input.interests,
        mustCover: input.mustCover,
      })) ?? []
  }
  if (process.env.ROUTE_DEBUG) console.log("PROPOSALS", JSON.stringify(proposals))
  if (proposals.length === 0) proposals = [{ name: destination, nights: Math.max(1, nights) }]

  const geocoded = (
    await Promise.all(
      proposals.slice(0, maxBases + 1).map(async (p) => {
        const hit =
          (await geocodePlace(tripId, p.name)) ??
          (p.name.toLowerCase().includes(destination.toLowerCase())
            ? null
            : await geocodePlace(tripId, `${p.name}, ${destination}`))
        return hit ? { ...p, point: { lat: hit.lat, lng: hit.lng } as LatLng } : null
      })
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null)

  // Every base must really be in the place the group chose (no sleeping in Mysore for a Coorg trip).
  const inside = geocoded.filter((c) => haversineKm(c.point, destPoint) <= radiusKm)
  let candidates: typeof geocoded = inside.length > 0 ? inside : [{ name: destination, nights: Math.max(1, nights), point: destPoint, why: undefined }]
  candidates = candidates.slice(0, maxBases)

  // Drop any base that makes a leg too long for this trip, worst offender first.
  const legMinutes = (list: typeof candidates) => {
    const order = bestOrder(gateway.point, list.map((c) => c.point), gateway.point)
    const seq = [gateway.point, ...order.map((i) => list[i].point), gateway.point]
    let worst = 0
    let worstAt = -1
    for (let i = 1; i < seq.length; i++) {
      const mins = roadMinutes(seq[i - 1], seq[i])
      if (mins > worst) {
        worst = mins
        worstAt = i
      }
    }
    return { worst, order, worstBase: worstAt <= order.length ? order[Math.max(0, worstAt - 1)] : order[order.length - 1] }
  }
  while (candidates.length > 1) {
    const { worst, worstBase } = legMinutes(candidates)
    if (worst <= maxLegMinutes) break
    candidates = candidates.filter((_, i) => i !== worstBase)
  }
  // A single base too far from the gateway for a short trip: stay at the gateway city instead.
  if (candidates.length === 1 && days <= 3 && roadMinutes(gateway.point, candidates[0].point) > maxLegMinutes && mode === "flight") {
    const city = await geocodePlace(tripId, `${gateway.label}, ${destAirport.country}`)
    candidates = [{ name: gateway.label, nights: Math.max(1, nights), point: city ? { lat: city.lat, lng: city.lng } : gateway.point, why: undefined }]
  }

  let order = bestOrder(gateway.point, candidates.map((c) => c.point), gateway.point)
  // The loop is the same length either way round: end at the base closest to the gateway,
  // so the last day, with a flight to catch, isn't spent on the longest drive.
  const rev = [...order].reverse()
  if (
    rev.length > 1 &&
    haversineKm(candidates[rev[rev.length - 1]].point, gateway.point) <
      haversineKm(candidates[order[order.length - 1]].point, gateway.point)
  ) {
    order = rev
  }
  const ordered = order.map((i) => candidates[i])

  // 3. Nights: every base gets at least one; the total is exactly days - 1.
  const alloc = ordered.map((c) => Math.max(1, Math.round(c.nights || 1)))
  if (nights > 0) {
    while (ordered.length > nights) {
      ordered.pop()
      alloc.pop()
    }
    let sum = alloc.reduce((x, y) => x + y, 0)
    while (sum > nights) {
      const idx = alloc.indexOf(Math.max(...alloc))
      if (alloc[idx] <= 1) break
      alloc[idx]--
      sum--
    }
    while (sum < nights) {
      alloc[alloc.indexOf(Math.max(...alloc))]++
      sum++
    }
  } else {
    ordered.splice(1)
    alloc.splice(0, alloc.length, 0)
  }

  // 4. What there is to do around each base.
  const dietQuery = input.dietQuery
  const bases: Base[] = await Promise.all(
    ordered.map(async (c, i) => {
      const area = await fetchAreaPlaces(tripId, c.name, dietQuery)
      const near = (p: RoutedPlace) => haversineKm(p, c.point) <= 35
      return {
        name: c.name,
        point: c.point,
        nights: alloc[i],
        why: c.why,
        attractions: dedupePlaces(area.attractions.filter(hasPoint).filter(near).sort((a, b) => score(b) - score(a))),
        restaurants: area.restaurants.filter(hasPoint).filter(near).sort((a, b) => score(b) - score(a)),
      }
    })
  )

  // Places the group insisted on: add them to the nearest base if they truly fit.
  const skipped: string[] = []
  for (const wanted of input.mustCover.slice(0, 3)) {
    const hit = await geocodePlace(tripId, `${wanted}, ${destination}`)
    if (!hit) continue
    let nearest = bases[0]
    let min = Number.POSITIVE_INFINITY
    for (const b of bases) {
      const d = haversineKm(hit, b.point)
      if (d < min) {
        min = d
        nearest = b
      }
    }
    if (min <= 60) {
      const place: RoutedPlace = { title: hit.name, lat: hit.lat, lng: hit.lng, address: hit.address, rating: 5, reviews: 100000 }
      if (!nearest.attractions.some((a) => a.title.toLowerCase() === place.title.toLowerCase())) nearest.attractions.unshift(place)
    } else {
      skipped.push(`${wanted} (about ${Math.round(min)} km from this route)`)
    }
  }

  // 5. Lay the days out.
  const flightHome = originAirport ?? nearestAirport(originPoint ?? gateway.point)
  const dep = mode === "flight" ? await fetchFlightOptions(tripId, flightHome.iata, destAirport.iata, input.startDate) : null
  const ret = mode === "flight" ? await fetchFlightOptions(tripId, destAirport.iata, flightHome.iata, input.endDate) : null
  const outFlight = dep ? pickOutbound(dep.options) : undefined
  const backFlight = ret ? pickReturn(ret.options) : undefined

  const baseOfNight: Base[] = []
  bases.forEach((b) => {
    for (let i = 0; i < b.nights; i++) baseOfNight.push(b)
  })

  const plans: DayPlan[] = []
  let roadTotal = 0
  let transfers = 0
  const startDate = new Date(`${input.startDate}T00:00:00Z`)

  for (let day = 1; day <= days; day++) {
    const first = day === 1
    const last = day === days
    const startBase = first ? null : baseOfNight[day - 2]
    const endBase = last ? null : baseOfNight[day - 1]
    const active = first ? (endBase ?? bases[0]) : last ? (startBase ?? bases[0]) : (endBase ?? startBase ?? bases[0])
    const switching = !first && !last && startBase && endBase && startBase !== endBase

    const fixed: FixedItem[] = []
    let from = 9 * 60
    let to = 20 * 60 + 30
    let title = ""

    if (first) {
      if (mode === "flight") {
        const out = outFlight
        const depT = out ? toMinutes(out.departs) : 8 * 60
        const arrT = out ? toMinutes(out.arrives) : depT + Math.round(40 + (haversineKm(flightHome, destAirport) / 750) * 60)
        const buffer = flightHome.country === destAirport.country ? 120 : 180
        const homeMin = roadMinutes(originPoint ?? flightHome, flightHome)
        const leave = depT - buffer - homeMin
        fixed.push({
          startTime: fromMinutes(leave),
          endTime: fromMinutes(depT - buffer),
          title: `Head to ${flightHome.name}`,
          description: `About ${formatDuration(homeMin)} from ${originLabel}. Check-in and security take ${formatDuration(buffer)} before departure.`,
          category: "TRAVEL",
          placeName: flightHome.name,
          point: flightHome,
          why: "Gives you a calm buffer for check-in and security.",
        })
        fixed.push({
          startTime: fromMinutes(depT),
          endTime: fromMinutes(arrT),
          title: out ? flightTitle(out) : `Flight ${flightHome.iata} to ${destAirport.iata}`,
          description: out ? flightDescription(out) : "Check live fares and times for your date.",
          category: "TRAVEL",
          placeName: destAirport.name,
          point: destAirport,
          link: dep?.link,
          engine: out ? "google_flights" : undefined,
          why: `${originLabel} to ${destAirport.city} in one hop, landing early enough to use the day.`,
        })
        const exit = flightHome.country === destAirport.country ? 40 : 60
        let t = arrT + exit
        const hopMin = roadMinutes(destAirport, active.point)
        {
          const km = roadKm(destAirport, active.point)
          roadTotal += km
          transfers++
          fixed.push({
            startTime: fromMinutes(t),
            endTime: fromMinutes(t + hopMin),
            title: `Transfer to ${active.name}`,
            description: `After immigration and bags (about ${formatDuration(exit)}), ${Math.round(km)} km and ${formatDuration(hopMin)} by cab or pre-booked car.`,
            category: "TRAVEL",
            placeName: active.name,
            point: active.point,
            why: "Straight from the airport to where you sleep, no detours.",
          })
          t += hopMin
        }
        from = roundUp15(t + 45)
        title = `Fly ${originLabel} to ${destAirport.city}${active.name !== destAirport.city ? `, settle in ${active.name}` : ", settle in"}`
      } else if (mode === "road" && originPoint) {
        const km = roadKm(originPoint, active.point)
        const mins = roadMinutes(originPoint, active.point)
        roadTotal += km
        transfers++
        fixed.push({
          startTime: "06:30",
          endTime: fromMinutes(6 * 60 + 30 + mins),
          title: `Drive ${originLabel} to ${active.name}`,
          description: `About ${Math.round(km)} km, ${formatDuration(mins)} on the road with a break.`,
          category: "TRAVEL",
          placeName: active.name,
          point: active.point,
          why: "An early start gets you there with the afternoon to spare.",
        })
        from = roundUp15(6 * 60 + 30 + mins + 45)
        title = `Drive to ${active.name}`
      } else {
        from = 11 * 60
        title = `Arrive in ${active.name}`
      }
    } else if (switching && startBase && endBase) {
      const km = roadKm(startBase.point, endBase.point)
      const mins = roadMinutes(startBase.point, endBase.point)
      roadTotal += km
      transfers++
      fixed.push({
        startTime: "09:30",
        endTime: fromMinutes(9 * 60 + 30 + mins),
        title: `Transfer ${startBase.name} to ${endBase.name}`,
        description: `About ${Math.round(km)} km, ${formatDuration(mins)}. Stop for a view or a meal on the way.`,
        category: "TRAVEL",
        placeName: endBase.name,
        point: endBase.point,
        why: "One transfer day, scheduled so the rest of your days stay local.",
      })
      from = roundUp15(9 * 60 + 30 + mins + 45)
      title = `On to ${endBase.name}`
    } else {
      title = `Around ${active.name}`
    }

    if (last) {
      const km = roadKm(active.point, gateway.point)
      const mins = roadMinutes(active.point, gateway.point)
      if (mode === "flight") {
        const back = backFlight
        const depT = back ? toMinutes(back.departs) : 19 * 60
        const buffer = destAirport.country === flightHome.country ? 120 : 180
        const leave = depT - buffer - mins - 15
        const arriveHome = back
          ? toMinutes(back.arrives)
          : depT + Math.round(40 + (haversineKm(flightHome, destAirport) / 750) * 60)
        roadTotal += km
        transfers++
        fixed.push({
          startTime: fromMinutes(leave),
          endTime: fromMinutes(depT - buffer),
          title: `Transfer to ${destAirport.name}`,
          description: `About ${Math.round(km)} km, ${formatDuration(mins)}. Arrive ${formatDuration(buffer)} before departure.`,
          category: "TRAVEL",
          placeName: destAirport.name,
          point: destAirport,
          why: "Leaves room for traffic and international check-in.",
        })
        fixed.push({
          startTime: fromMinutes(depT),
          endTime: fromMinutes(arriveHome),
          title: back ? flightTitle(back) : `Flight ${destAirport.iata} to ${flightHome.iata}`,
          description: back ? flightDescription(back) : "Check live fares and times for your date.",
          category: "TRAVEL",
          placeName: flightHome.name,
          point: flightHome,
          link: ret?.link,
          engine: back ? "google_flights" : undefined,
          why: `Back to ${originLabel} the same night.`,
        })
        to = leave - 30
        title = `Last morning, then fly home to ${originLabel}`
      } else if (mode === "road" && originPoint) {
        const depart = 16 * 60
        roadTotal += km
        transfers++
        fixed.push({
          startTime: fromMinutes(depart),
          endTime: fromMinutes(depart + mins),
          title: `Drive back to ${originLabel}`,
          description: `About ${Math.round(km)} km, ${formatDuration(mins)}.`,
          category: "TRAVEL",
          placeName: originLabel ?? undefined,
          point: originPoint,
          why: "Leaves after an afternoon outing and gets you home at a sensible hour.",
        })
        to = depart - 30
        title = `Last day, then drive home to ${originLabel}`
      } else {
        to = 17 * 60
        title = `Last day in ${active.name}`
      }
    }

    const window = { from: fromMinutes(Math.min(from, 22 * 60)), to: fromMinutes(Math.max(to, from)) }
    const span = Math.max(0, to - from)
    let maxStops = span < 100 ? 0 : Math.min(PACE_CAP[input.pace], Math.max(1, Math.floor(span / 140)))
    // After a flight or a long drive nobody wants a full day: one stop fewer.
    if (first && mode !== "none" && maxStops > 1) maxStops -= 1
    plans.push({
      day,
      date: addDays(startDate, day - 1).toISOString().slice(0, 10),
      title,
      base: active.name,
      basePoint: active.point,
      window,
      maxStops,
      fixed,
      candidates: [],
      restaurants: [],
    })
  }

  // 6. Deal the stops out: one path per base, cut into days, so each day is a tidy cluster.
  for (const base of bases) {
    const mine = plans.filter((p) => p.base === base.name && p.maxStops > 0)
    const slots = mine.reduce((n, p) => n + p.maxStops, 0)
    if (slots === 0) continue
    const pool = base.attractions.slice(0, slots)
    const path = bestOrder(base.point, pool).map((i) => pool[i])
    let cursor = 0
    for (const p of mine) {
      const chunk = path.slice(cursor, cursor + p.maxStops)
      cursor += p.maxStops
      let prev: LatLng = base.point
      p.candidates = chunk.map((c) => {
        const kmFromPrev = Math.round(roadKm(prev, c) * 10) / 10
        prev = c
        return { ...c, kmFromPrev }
      })
    }
    // Different restaurants each day, so the crew isn't sent to the same place every night.
    const rest = base.restaurants
    mine.forEach((p, i) => {
      p.restaurants = rest.length === 0 ? [] : Array.from({ length: Math.min(4, rest.length) }, (_, k) => rest[(i * 3 + k) % rest.length])
    })
  }
  for (const p of plans) {
    if (p.restaurants.length === 0) {
      const base = bases.find((b) => b.name === p.base)
      p.restaurants = base?.restaurants.slice(0, 4) ?? []
    }
    // Free time with nothing to fill it: say so honestly instead of forcing a stop.
    p.maxStops = Math.min(p.maxStops, Math.max(p.candidates.length, 0))
  }

  // 7. A headline, and the total distance an honest person would quote.
  const gatewayHop = mode === "flight" ? [destAirport.city] : []
  const hops = [
    ...(originLabel ? [originLabel] : []),
    ...gatewayHop,
    ...bases.map((b) => b.name),
    ...gatewayHop,
    ...(originLabel ? [originLabel] : []),
  ]
  const headline = hops
    .filter((h, i) => i === 0 || h.toLowerCase() !== hops[i - 1].toLowerCase())
    .join(" → ")

  const dayKm = plans.reduce((n, p) => {
    const pts = [p.basePoint as LatLng, ...p.candidates.map((c) => ({ lat: c.lat, lng: c.lng }))]
    return n + (p.candidates.length > 0 ? pathKm([...pts, p.basePoint as LatLng]) : 0)
  }, 0)

  return {
    mode,
    originLabel,
    gatewayLabel: gateway.label,
    bases,
    days: plans,
    headline,
    totals: { roadKm: Math.round(roadTotal + dayKm), transfers },
    skipped,
  }
}

export function routeAvailable() {
  return hasSerpApi()
}
