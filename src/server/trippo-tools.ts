import { addDays } from "date-fns"

import { findAirport } from "@/lib/airports"
import { haversineKm } from "@/lib/geo"
import {
  convertCurrency,
  fetchDirections,
  searchHotelsNear,
  searchPlacesNear,
  webSearch,
  type DirectionsOption,
} from "@/server/serpapi"
import {
  formatMinutes,
  type HotelItem,
  type PlaceItem,
  type TransportItem,
} from "@/lib/chat"

/**
 * What Trippo can look up. Every tool does real SerpApi work and files what it finds
 * in a registry under short ids (h1, t2, p3...). The model refers to those ids when it
 * answers, so the cards in the chat always carry real data, never something re-typed.
 *
 * What goes back to the model is deliberately small: the model is on a per-minute token
 * budget, and the registry keeps the full detail for the cards anyway.
 */

export type ToolContext = {
  tripId: string
  destination: string
  startDate: string
  endDate: string
  currency: string
  crewSize: number
}

export type Registry = {
  hotels: Map<string, HotelItem>
  transports: Map<string, TransportItem>
  places: Map<string, PlaceItem>
  /** What was searched, for card headers. */
  hotelArea?: string
  hotelStay?: { checkIn: string; checkOut: string; nights: number; guests: number }
  route?: { from: string; to: string; distanceKm?: number }
  placesArea?: string
}

export function newRegistry(): Registry {
  return { hotels: new Map(), transports: new Map(), places: new Map() }
}

const COUNTRY_INFO: Record<string, { gl: string; currency: string }> = {
  India: { gl: "in", currency: "INR" },
  "Sri Lanka": { gl: "lk", currency: "LKR" },
  Maldives: { gl: "mv", currency: "MVR" },
  Nepal: { gl: "np", currency: "NPR" },
  Bhutan: { gl: "bt", currency: "BTN" },
  Singapore: { gl: "sg", currency: "SGD" },
  Thailand: { gl: "th", currency: "THB" },
  Malaysia: { gl: "my", currency: "MYR" },
  Indonesia: { gl: "id", currency: "IDR" },
  Vietnam: { gl: "vn", currency: "VND" },
  Cambodia: { gl: "kh", currency: "KHR" },
  UAE: { gl: "ae", currency: "AED" },
  Qatar: { gl: "qa", currency: "QAR" },
  Japan: { gl: "jp", currency: "JPY" },
  "South Korea": { gl: "kr", currency: "KRW" },
  "United Kingdom": { gl: "gb", currency: "GBP" },
  France: { gl: "fr", currency: "EUR" },
  Turkey: { gl: "tr", currency: "TRY" },
  Australia: { gl: "au", currency: "AUD" },
  USA: { gl: "us", currency: "USD" },
}

function countryInfo(text: string) {
  const country = findAirport(text)?.country
  return (country && COUNTRY_INFO[country]) || COUNTRY_INFO.India
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** Hotel searches need future dates: slide a past trip forward, keep its length. */
function stayWindow(ctx: ToolContext, checkIn?: string, checkOut?: string) {
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
  const tripStart = new Date(`${ctx.startDate}T00:00:00Z`)
  const tripEnd = new Date(`${ctx.endDate}T00:00:00Z`)
  // Dates the model picks are kept inside the trip: you leave on its last day, not the day after.
  const within = (d: Date) => new Date(Math.min(Math.max(d.getTime(), tripStart.getTime()), tripEnd.getTime()))
  let start = within(new Date(`${valid(checkIn) ?? ctx.startDate}T00:00:00Z`))
  const end = within(new Date(`${valid(checkOut) ?? ctx.endDate}T00:00:00Z`))
  const earliest = addDays(new Date(`${isoDay(new Date())}T00:00:00Z`), 2)
  let nights = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  if (!Number.isFinite(nights) || nights < 1) nights = 1
  nights = Math.min(nights, 10)
  if (start < earliest) start = earliest
  return { checkIn: isoDay(start), checkOut: isoDay(addDays(start, nights)), nights }
}

/** A rating adjusted for how many people gave it: 4.9 from 300 reviews isn't 4.7 from 20,000. */
const trusted = (rating = 0, reviews = 0) => (reviews * rating + 60 * 4.0) / (reviews + 60)

// ── Hotels ─────────────────────────────────────────────────────────────

export async function toolSearchHotels(
  ctx: ToolContext,
  reg: Registry,
  args: {
    near?: string
    check_in?: string
    check_out?: string
    sort?: string
    min_rating?: number
    max_price_per_night?: number
  }
) {
  const near = (args.near ?? "").trim().slice(0, 120) || ctx.destination
  const window = stayWindow(ctx, args.check_in, args.check_out)
  const sort = args.sort === "price" ? "price" : args.sort === "rating" ? "rating" : undefined

  let found = await searchHotelsNear(ctx.tripId, {
    near,
    ...window,
    adults: ctx.crewSize,
    currency: ctx.currency,
    sort,
    minRating: args.min_rating,
    maxPrice: args.max_price_per_night,
  })
  // Filters can empty a small market: fall back to the plain search rather than say "nothing".
  if (found.hotels.length === 0 && (sort || args.min_rating || args.max_price_per_night)) {
    found = await searchHotelsNear(ctx.tripId, { near, ...window, adults: ctx.crewSize, currency: ctx.currency })
  }
  if (found.hotels.length === 0) return { area: near, hotels: [], note: "No hotels were returned for this search." }

  const ranked = [...found.hotels].sort((a, b) =>
    sort === "price"
      ? (a.priceValue ?? Infinity) - (b.priceValue ?? Infinity)
      : trusted(b.rating, b.reviews) - trusted(a.rating, a.reviews)
  )
  const top = ranked.slice(0, 6)

  const reliable = top.filter((h) => trusted(h.rating, h.reviews) >= 4.2 && h.priceValue)
  const bestValue = [...reliable].sort((a, b) => (a.priceValue ?? Infinity) - (b.priceValue ?? Infinity))[0]
  const closest = [...top].filter((h) => h.distanceKm !== undefined).sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))[0]
  const topRated = [...top].sort((a, b) => trusted(b.rating, b.reviews) - trusted(a.rating, a.reviews))[0]

  reg.hotelArea = near
  reg.hotelStay = { ...window, guests: ctx.crewSize }

  const base = reg.hotels.size
  return {
    area: near,
    stay: reg.hotelStay,
    currency: ctx.currency,
    hotels: top.map((h, i) => {
      const key = `h${base + i + 1}`
      reg.hotels.set(key, { ...h, key })
      return {
        id: key,
        name: h.name,
        rating: h.rating,
        reviews: h.reviews,
        price: h.priceNight,
        stars: h.stars,
        km: h.distanceKm,
        amenities: h.amenities.slice(0, 3),
        nearby: h.nearby[0],
        best: [h === topRated ? "top rated" : null, h === bestValue ? "best value" : null, h === closest ? "closest" : null].filter(Boolean),
      }
    }),
  }
}

// ── Places ─────────────────────────────────────────────────────────────

export async function toolSearchPlaces(
  ctx: ToolContext,
  reg: Registry,
  args: { query?: string; near?: string }
) {
  const query = (args.query ?? "").trim().slice(0, 100) || "top things to do"
  const near = (args.near ?? "").trim().slice(0, 120) || ctx.destination
  const { places } = await searchPlacesNear(ctx.tripId, query, near)
  if (places.length === 0) return { near, places: [], note: "No places were returned." }

  reg.placesArea = near
  const base = reg.places.size
  const ranked = [...places].sort((a, b) => trusted(b.rating, b.reviews) - trusted(a.rating, a.reviews)).slice(0, 6)
  return {
    near,
    places: ranked.map((p, i) => {
      const key = `p${base + i + 1}`
      reg.places.set(key, { key, name: p.name, category: p.category, rating: p.rating, reviews: p.reviews, price: p.price, address: p.address, image: p.image, link: p.link, lat: p.lat, lng: p.lng, hours: p.hours, distanceKm: p.distanceKm })
      return { id: key, name: p.name, type: p.category, rating: p.rating, reviews: p.reviews, price: p.price, km: p.distanceKm, hours: p.hours }
    }),
  }
}

// ── Getting from A to B ────────────────────────────────────────────────

function toTransportItems(
  options: DirectionsOption[],
  straightKm: number | undefined
): Omit<TransportItem, "key">[] {
  const out: Omit<TransportItem, "key">[] = []
  const seen = new Set<string>()

  // Door-to-door by road: the fastest of what Google returns.
  const driving = options.filter((o) => o.travelMode === "Driving").sort((a, b) => a.durationMin - b.durationMin)[0]
  if (driving) {
    out.push({
      mode: "cab",
      title: "Taxi or pre-booked cab",
      durationMin: driving.durationMin,
      distanceKm: driving.distanceKm,
      route: driving.via ? `via ${driving.via}` : undefined,
      note: [driving.typicalRange ? `Usually ${driving.typicalRange}` : null, ...driving.notes].filter(Boolean).join(". ") || undefined,
      pros: ["Door to door", "Leave when you like"],
      cons: [],
      tags: [],
      source: "Google Maps",
    })
  }

  // Public transport: the best couple of trains and buses, one per service.
  const transit = options.filter((o) => o.travelMode === "Transit")
  const describe = (o: DirectionsOption) => {
    const rides = o.legs.filter((l) => l.mode === "Transit")
    const walk = o.legs.filter((l) => l.mode === "Walking").reduce((n, l) => n + l.durationMin, 0)
    return { rides, walk, first: rides[0], last: rides[rides.length - 1], rail: rides.some((r) => r.rail) }
  }
  const byKind = (rail: boolean) =>
    transit
      .map((o) => ({ o, d: describe(o) }))
      .filter(({ d }) => d.rides.length > 0 && d.rail === rail)
      .sort((a, b) => a.o.durationMin - b.o.durationMin)
  for (const rail of [true, false]) {
    let kept = 0
    for (const { o, d } of byKind(rail)) {
      const id = `${rail}-${d.first.operator ?? ""}-${d.first.title}`
      if (seen.has(id) || kept >= 2) continue
      seen.add(id)
      kept++
      const changes = d.rides.length - 1
      out.push({
        mode: rail ? "train" : "bus",
        title: rail ? "Train" : "Bus",
        operator: d.first.operator,
        durationMin: o.durationMin,
        distanceKm: o.distanceKm,
        departs: d.first.departs ?? o.departs,
        arrives: d.last.arrives ?? o.arrives,
        fromStop: d.first.fromStop,
        toStop: d.last.toStop,
        route: d.first.title ? (/^\d/.test(d.first.title) ? `Route ${d.first.title}` : d.first.title) : undefined,
        note: [d.walk > 0 ? `${d.walk} min of walking at the ends` : null, changes > 0 ? `${changes} change${changes > 1 ? "s" : ""}` : null].filter(Boolean).join(". ") || undefined,
        pros: rail ? ["Comfortable", "No traffic"] : ["Cheap", "Frequent"],
        cons: changes > 0 ? ["Has a change"] : [],
        tags: [],
        source: "Google Maps",
      })
    }
  }

  // A scooter or motorbike is a real local option for short hops.
  const bike = options.filter((o) => o.travelMode === "Two-wheeler").sort((a, b) => a.durationMin - b.durationMin)[0]
  if (bike && (straightKm ?? bike.distanceKm) <= 120) {
    out.push({
      mode: "bike",
      title: "Scooter or motorbike taxi",
      durationMin: bike.durationMin,
      distanceKm: bike.distanceKm,
      route: bike.via ? `via ${bike.via}` : undefined,
      pros: ["Cuts through traffic"],
      cons: ["Luggage and weather are a problem"],
      tags: [],
      source: "Google Maps",
    })
  }

  const walk = options.filter((o) => o.travelMode === "Walking").sort((a, b) => a.durationMin - b.durationMin)[0]
  if (walk && walk.distanceKm <= 6) {
    out.push({
      mode: "walk",
      title: "Walk",
      durationMin: walk.durationMin,
      distanceKm: walk.distanceKm,
      pros: ["Free", "See the streets"],
      cons: [],
      tags: [],
      source: "Google Maps",
    })
  }
  return out
}

export async function toolTransportOptions(
  ctx: ToolContext,
  reg: Registry,
  args: { from?: string; to?: string }
) {
  const from = (args.from ?? "").trim().slice(0, 140)
  const to = (args.to ?? "").trim().slice(0, 140)
  if (!from || !to) return { error: "Both a start and an end place are needed." }

  const info = countryInfo(`${to} ${ctx.destination}`)
  const [drive, transit, bike, publicFares, taxiFares, rate] = await Promise.all([
    fetchDirections(ctx.tripId, from, to, 0),
    fetchDirections(ctx.tripId, from, to, 3),
    fetchDirections(ctx.tripId, from, to, 9),
    webSearch(ctx.tripId, `${from} to ${to} train bus ticket price fare`, info.gl),
    webSearch(ctx.tripId, `${from} to ${to} taxi cab price cost`, info.gl),
    // Fares are quoted in the local currency; the crew thinks in the trip currency.
    info.currency !== ctx.currency ? convertCurrency(ctx.tripId, 100, info.currency, ctx.currency) : Promise.resolve(null),
  ])

  const start = drive.start ?? transit.start
  const end = drive.end ?? transit.end
  const straightKm = start && end ? Math.round(haversineKm(start, end) * 10) / 10 : undefined

  let walkOptions: DirectionsOption[] = []
  if (straightKm !== undefined && straightKm <= 5) {
    walkOptions = (await fetchDirections(ctx.tripId, from, to, 2)).options
  }

  const items = toTransportItems([...drive.options, ...transit.options, ...bike.options, ...walkOptions], straightKm)
  reg.route = { from, to, distanceKm: drive.options[0]?.distanceKm ?? straightKm }

  const snippet = (r: { title: string; snippet: string }) => `${r.title}: ${r.snippet}`.slice(0, 230)
  const base = reg.transports.size
  return {
    from,
    to,
    options: items.map((it, i) => {
      const key = `t${base + i + 1}`
      reg.transports.set(key, { ...it, key })
      return {
        id: key,
        mode: it.mode,
        operator: it.operator,
        duration: formatMinutes(it.durationMin),
        km: it.distanceKm,
        departs: it.departs,
        arrives: it.arrives,
        board: it.fromStop,
        alight: it.toStop,
        via: it.route,
        note: it.note,
      }
    }),
    // Computed here, not by the model: which option is quickest (walking excluded).
    fastest: (() => {
      const timed = [...reg.transports.values()].filter((t) => t.durationMin !== undefined && t.mode !== "walk")
      return timed.sort((a, b) => (a.durationMin ?? 0) - (b.durationMin ?? 0))[0]?.key
    })(),
    no_public_transport_data: transit.options.length === 0 || undefined,
    // Local currency fares come with the rate to the trip currency: 1 local = rate trip.
    fx: rate ? { local: info.currency, trip: ctx.currency, rate: Math.round((rate.converted / 100) * 10000) / 10000 } : undefined,
    fare_snippets: {
      public_transport: publicFares.results.slice(0, 3).map(snippet),
      taxi: taxiFares.results.slice(0, 3).map(snippet),
    },
  }
}

// ── Anything else ──────────────────────────────────────────────────────

export async function toolWebSearch(ctx: ToolContext, args: { query?: string }) {
  const query = (args.query ?? "").trim().slice(0, 160)
  if (!query) return { error: "A search query is needed." }
  const result = await webSearch(ctx.tripId, query, countryInfo(`${query} ${ctx.destination}`).gl)
  return {
    answer: result.answer,
    results: result.results.slice(0, 4).map((r) => `${r.title}: ${r.snippet}`.slice(0, 230)),
  }
}
