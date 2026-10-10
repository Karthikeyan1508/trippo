/* eslint-disable @typescript-eslint/no-explicit-any */
import { addDays } from "date-fns"

import { prisma } from "@/lib/prisma"
import { haversineKm } from "@/lib/geo"
import { safeHttpUrl } from "@/lib/safe-url"
import type { HotelItem } from "@/lib/chat"

const SERP_BASE = "https://serpapi.com/search.json"
const CACHE_TTL_DAYS = 7

export function hasSerpApi() {
  return Boolean(process.env.SERPAPI_API_KEY)
}

export type PlaceLite = {
  title: string
  category?: string
  address?: string
  rating?: number
  reviews?: number
  price?: string
  lat?: number
  lng?: number
  link?: string
  thumbnail?: string
}

export type HotelLite = {
  name: string
  price?: string
  rating?: number
  type?: string
  amenities?: string[]
  link?: string
  thumbnail?: string
}

export type EventLite = {
  title: string
  when?: string
  address?: string
  venue?: string
  link?: string
}

export type ResearchBundle = {
  available: boolean
  attractions: PlaceLite[]
  hotels: HotelLite[]
  restaurants: PlaceLite[]
  events: EventLite[]
}

type SerpParams = Record<string, string | number | undefined>

function queryKey(params: SerpParams) {
  const clean = Object.entries(params)
    .filter(([k, v]) => v !== undefined && k !== "api_key")
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(clean)
}

/** Cached SerpApi call: returns the raw JSON, hitting the network only on a cache miss. */
async function serpFetch(
  tripId: string,
  engine: string,
  params: SerpParams,
  ttlDays = CACHE_TTL_DAYS
): Promise<any | null> {
  if (!hasSerpApi()) return null

  const key = queryKey(params)
  const cached = await prisma.researchQuery.findUnique({
    where: { tripId_engine_queryKey: { tripId, engine, queryKey: key } },
  })
  if (cached && cached.expiresAt > new Date()) {
    return cached.response as any
  }

  const url = new URL(SERP_BASE)
  url.searchParams.set("engine", engine)
  url.searchParams.set("api_key", process.env.SERPAPI_API_KEY as string)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }

  let json: any
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    json = await res.json()
  } catch {
    return null
  }
  if (json?.error) return null

  await prisma.researchQuery.upsert({
    where: { tripId_engine_queryKey: { tripId, engine, queryKey: key } },
    create: {
      tripId,
      engine,
      queryKey: key,
      params: params as any,
      response: json,
      expiresAt: addDays(new Date(), ttlDays),
    },
    update: {
      params: params as any,
      response: json,
      fetchedAt: new Date(),
      expiresAt: addDays(new Date(), ttlDays),
    },
  })
  return json
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : (v as number)
  return typeof n === "number" && Number.isFinite(n) ? n : undefined
}

function normalizePlace(r: any): PlaceLite {
  return {
    title: r.title ?? r.name ?? "Unknown",
    category: r.type ?? r.category,
    address: r.address,
    rating: num(r.rating),
    reviews: num(r.reviews),
    price: r.price,
    lat: r.gps_coordinates?.latitude,
    lng: r.gps_coordinates?.longitude,
    link: r.website ?? r.links?.website ?? r.link,
    thumbnail: r.thumbnail,
  }
}

export async function fetchAttractions(
  tripId: string,
  destination: string
): Promise<PlaceLite[]> {
  const json = await serpFetch(tripId, "google_maps", {
    q: `top things to do in ${destination}`,
    type: "search",
    hl: "en",
  })
  const results: any[] = json?.local_results ?? []
  return results.slice(0, 14).map(normalizePlace)
}

export async function fetchRestaurants(
  tripId: string,
  destination: string,
  dietQuery: string
): Promise<PlaceLite[]> {
  const json = await serpFetch(tripId, "google_local", {
    q: `${dietQuery} restaurants in ${destination}`.trim(),
    hl: "en",
    gl: "in",
  })
  const results: any[] = json?.local_results ?? []
  return results.slice(0, 12).map(normalizePlace)
}

export async function fetchHotels(
  tripId: string,
  destination: string,
  checkIn: string,
  checkOut: string
): Promise<HotelLite[]> {
  const json = await serpFetch(tripId, "google_hotels", {
    q: `Hotels in ${destination}`,
    check_in_date: checkIn,
    check_out_date: checkOut,
    adults: 2,
    currency: "INR",
    hl: "en",
    gl: "in",
  })
  const props: any[] = json?.properties ?? []
  return props.slice(0, 10).map((p) => ({
    name: p.name ?? "Stay",
    price: p.rate_per_night?.lowest ?? p.total_rate?.lowest,
    rating: num(p.overall_rating),
    type: p.type,
    amenities: Array.isArray(p.amenities) ? p.amenities.slice(0, 5) : undefined,
    link: p.link,
    thumbnail: p.images?.[0]?.thumbnail,
  }))
}

export async function fetchEvents(
  tripId: string,
  destination: string
): Promise<EventLite[]> {
  const json = await serpFetch(tripId, "google_events", {
    q: `Events in ${destination}`,
    hl: "en",
    gl: "in",
  })
  const evs: any[] = json?.events_results ?? []
  return evs.slice(0, 10).map((e) => ({
    title: e.title ?? "Event",
    when: e.date?.when,
    address: Array.isArray(e.address) ? e.address.join(", ") : e.address,
    venue: e.venue?.name,
    link: e.link,
  }))
}

/** A few photos of a place via google_images (cached; [] if no key). */
export async function fetchPlaceImages(
  tripId: string,
  query: string
): Promise<string[]> {
  const json = await serpFetch(tripId, "google_images", {
    q: query,
    hl: "en",
    gl: "in",
  })
  if (!json) return []
  const results: any[] = json.images_results ?? []
  return results
    .slice(0, 6)
    .map((r) => r.thumbnail || r.original)
    .filter((u): u is string => typeof u === "string")
}

/** Web-search snippet of destination etiquette/tips (cached; "" if no key). */
export async function fetchTravelTips(
  tripId: string,
  destination: string
): Promise<string> {
  const json = await serpFetch(tripId, "google", {
    q: `travel etiquette, customs, dress code and safety tips for tourists in ${destination}`,
    hl: "en",
    gl: "in",
  })
  if (!json) return ""
  const answer: string | undefined =
    json.answer_box?.snippet ?? json.answer_box?.answer
  const organic: string = (json.organic_results ?? [])
    .slice(0, 4)
    .map((r: any) => `- ${r.title}: ${r.snippet ?? ""}`)
    .join("\n")
  const related: string = (json.related_questions ?? [])
    .slice(0, 3)
    .map((q: any) => `- ${q.question}: ${q.snippet ?? ""}`)
    .join("\n")
  return [answer, organic, related].filter(Boolean).join("\n").slice(0, 2500)
}

/** Fetches everything the itinerary generator needs, in parallel and cached. */
export async function researchTrip(input: {
  tripId: string
  destination: string
  checkIn: string
  checkOut: string
  dietQuery: string
}): Promise<ResearchBundle> {
  if (!hasSerpApi()) {
    return {
      available: false,
      attractions: [],
      hotels: [],
      restaurants: [],
      events: [],
    }
  }

  const { tripId, destination, checkIn, checkOut, dietQuery } = input
  const [attractions, hotels, restaurants, events] = await Promise.all([
    fetchAttractions(tripId, destination),
    fetchHotels(tripId, destination, checkIn, checkOut),
    fetchRestaurants(tripId, destination, dietQuery),
    fetchEvents(tripId, destination),
  ])

  return { available: true, attractions, hotels, restaurants, events }
}


// ── Amazon product search ───────────────────────────────────────────────

export type ProductLite = {
  asin: string
  title: string
  /** Display price exactly as the store shows it, e.g. "₹1,499". */
  price?: string
  priceValue?: number
  oldPriceValue?: number
  /** Whole-number percentage off, when a was-price is shown. */
  discountPct?: number
  rating?: number
  reviews?: number
  image?: string
  /** "2K+ bought in past month" style social proof, if the store shows it. */
  boughtLastMonth?: string
}

/**
 * Searches an Amazon storefront through SerpApi's `amazon` engine. Cached per
 * trip for a day, so the whole crew shares one credit per search.
 */
export async function fetchAmazonProducts(
  tripId: string,
  query: string,
  domain: string,
  sort?: string
): Promise<ProductLite[]> {
  const json = await serpFetch(
    tripId,
    "amazon",
    { k: query, amazon_domain: domain, s: sort },
    1
  )
  const results: any[] = json?.organic_results ?? []

  const seen = new Set<string>()
  const out: ProductLite[] = []
  for (const r of results) {
    const asin = typeof r.asin === "string" ? r.asin : undefined
    if (!asin || seen.has(asin) || !r.title || !r.thumbnail) continue
    seen.add(asin)

    const priceValue = num(r.extracted_price)
    const oldPriceValue = num(r.extracted_old_price)
    out.push({
      asin,
      title: String(r.title),
      price: typeof r.price === "string" ? r.price : undefined,
      priceValue,
      oldPriceValue,
      discountPct:
        priceValue != null && oldPriceValue != null && oldPriceValue > priceValue
          ? Math.round((1 - priceValue / oldPriceValue) * 100)
          : undefined,
      rating: num(r.rating),
      reviews: num(r.reviews),
      image: r.thumbnail,
      boughtLastMonth:
        typeof r.bought_last_month === "string" ? r.bought_last_month : undefined,
    })
    if (out.length >= 24) break
  }
  return out
}


// ── Route planning data: geocoding, per-area places, flights ────────────

export type GeoPoint = { name: string; lat: number; lng: number; address?: string }

/** Coordinates for a place name (a city, a region, an airport). Cached for a month. */
export async function geocodePlace(tripId: string, query: string): Promise<GeoPoint | null> {
  const json = await serpFetch(
    tripId,
    "google_maps",
    { q: query, type: "search", hl: "en" },
    30
  )
  if (!json) return null
  const single = json.place_results
  const first = single?.gps_coordinates ? single : (json.local_results ?? [])[0]
  const gps = first?.gps_coordinates
  const lat = num(gps?.latitude)
  const lng = num(gps?.longitude)
  if (lat === undefined || lng === undefined) return null
  return { name: first.title ?? query, lat, lng, address: first.address }
}

/** The things worth doing, and eating, around one base. Only places with coordinates are useful for routing. */
export async function fetchAreaPlaces(
  tripId: string,
  area: string,
  dietQuery = ""
): Promise<{ attractions: PlaceLite[]; restaurants: PlaceLite[] }> {
  const [maps, local] = await Promise.all([
    serpFetch(tripId, "google_maps", { q: `top things to do in ${area}`, type: "search", hl: "en" }),
    serpFetch(tripId, "google_local", { q: `${dietQuery} restaurants in ${area}`.trim(), hl: "en", gl: "in" }),
  ])
  const attractions: PlaceLite[] = ((maps?.local_results as any[]) ?? []).slice(0, 16).map(normalizePlace)
  const restaurants: PlaceLite[] = ((local?.local_results as any[]) ?? []).slice(0, 10).map(normalizePlace)
  return { attractions, restaurants }
}

export type FlightLite = {
  airline: string
  flightNumber?: string
  from: string
  to: string
  /** Local "HH:MM". */
  departs: string
  arrives: string
  /** Calendar days between departure and arrival (an overnight flight is 1). */
  arrivesNextDay: number
  durationMin: number
  stops: number
  price?: number
}

const clock = (value?: string) => (typeof value === "string" ? value.slice(11, 16) : "")

/** One-way options for a date, cheapest first within the "best" ones SerpApi returns. */
export async function fetchFlightOptions(
  tripId: string,
  from: string,
  to: string,
  date: string
): Promise<{ options: FlightLite[]; link: string }> {
  const link = `https://www.google.com/travel/flights?q=${encodeURIComponent(
    `Flights from ${from} to ${to} on ${date}`
  )}`
  const json = await serpFetch(
    tripId,
    "google_flights",
    {
      departure_id: from,
      arrival_id: to,
      outbound_date: date,
      type: 2,
      currency: "INR",
      hl: "en",
      gl: "in",
    },
    3
  )
  if (!json) return { options: [], link }

  const rows: any[] = [...(json.best_flights ?? []), ...(json.other_flights ?? [])]
  const options: FlightLite[] = []
  for (const row of rows) {
    const legs: any[] = row.flights ?? []
    if (legs.length === 0) continue
    const first = legs[0]
    const last = legs[legs.length - 1]
    const departs = clock(first.departure_airport?.time)
    const arrives = clock(last.arrival_airport?.time)
    if (!departs || !arrives) continue
    const days = Math.round(
      (Date.parse(String(last.arrival_airport.time).slice(0, 10)) -
        Date.parse(String(first.departure_airport.time).slice(0, 10))) /
        86_400_000
    )
    options.push({
      airline: String(first.airline ?? "Airline"),
      flightNumber: first.flight_number ? String(first.flight_number) : undefined,
      from: String(first.departure_airport?.id ?? from),
      to: String(last.arrival_airport?.id ?? to),
      departs,
      arrives,
      arrivesNextDay: Number.isFinite(days) ? days : 0,
      durationMin: num(row.total_duration) ?? 0,
      stops: legs.length - 1,
      price: num(row.price),
    })
  }
  return { options, link }
}


// ── Crew chat tools: hotels near an area, places, directions, web search ─

export type RawHotel = Omit<HotelItem, "key" | "why" | "badge">

/** Google serves tiny thumbnails; the same image at card size looks far better. */
function enlarge(url?: string): string | undefined {
  if (!url) return undefined
  return url.replace(/=s\d+-w\d+-h\d+-n-k-no-v1$/, "=w574-h384-k-no")
}

/** Hotels around a place, with prices for the dates, and how far each is from that place. */
export async function searchHotelsNear(
  tripId: string,
  input: {
    near: string
    checkIn: string
    checkOut: string
    adults: number
    currency: string
    sort?: "rating" | "price" | "reviews"
    minRating?: number
    maxPrice?: number
  }
): Promise<{ hotels: RawHotel[]; center: GeoPoint | null }> {
  const [json, center] = await Promise.all([
    serpFetch(
      tripId,
      "google_hotels",
      {
        q: `Hotels near ${input.near}`,
        check_in_date: input.checkIn,
        check_out_date: input.checkOut,
        adults: Math.max(1, Math.min(input.adults, 8)),
        currency: input.currency,
        hl: "en",
        gl: "in",
        sort_by: input.sort === "price" ? 3 : input.sort === "reviews" ? 13 : input.sort === "rating" ? 8 : undefined,
        rating: input.minRating ? (input.minRating >= 4.5 ? 9 : input.minRating >= 4 ? 8 : 7) : undefined,
        max_price: input.maxPrice,
      },
      3
    ),
    geocodePlace(tripId, input.near),
  ])

  const props: any[] = json?.properties ?? []
  const hotels = props
    .filter((p) => p?.name && (p.type === undefined || p.type === "hotel" || p.type === "vacation rental"))
    .map((p): RawHotel => {
      const lat = num(p.gps_coordinates?.latitude)
      const lng = num(p.gps_coordinates?.longitude)
      return {
        name: String(p.name),
        rating: num(p.overall_rating),
        reviews: num(p.reviews),
        priceNight: p.rate_per_night?.lowest,
        priceValue: num(p.rate_per_night?.extracted_lowest),
        priceTotal: p.total_rate?.lowest,
        stars: num(p.extracted_hotel_class),
        amenities: Array.isArray(p.amenities) ? p.amenities.slice(0, 6).map(String) : [],
        image: enlarge(p.images?.[0]?.thumbnail),
        link:
          safeHttpUrl(p.link) ??
          `https://www.google.com/travel/hotels?q=${encodeURIComponent(`${p.name} ${input.near}`)}`,
        lat,
        lng,
        distanceKm:
          center && lat !== undefined && lng !== undefined
            ? Math.round(haversineKm(center, { lat, lng }) * 10) / 10
            : undefined,
        nearby: Array.isArray(p.nearby_places)
          ? p.nearby_places
              .slice(0, 3)
              .map((n: any) => {
                const t = n?.transportations?.[0]
                return n?.name ? `${n.name}${t ? `: ${t.duration} by ${String(t.type).toLowerCase()}` : ""}` : null
              })
              .filter((x: string | null): x is string => Boolean(x))
          : [],
        checkIn: p.check_in_time,
        checkOut: p.check_out_time,
      }
    })
  return { hotels, center }
}

export type RawPlace = {
  name: string
  category?: string
  rating?: number
  reviews?: number
  price?: string
  address?: string
  image?: string
  link?: string
  lat?: number
  lng?: number
  hours?: string
  distanceKm?: number
}

/** Things to do, eat or see around a place. */
export async function searchPlacesNear(
  tripId: string,
  query: string,
  near: string
): Promise<{ places: RawPlace[]; center: GeoPoint | null }> {
  const [json, center] = await Promise.all([
    serpFetch(tripId, "google_maps", { q: `${query} near ${near}`, type: "search", hl: "en" }, 5),
    geocodePlace(tripId, near),
  ])
  const results: any[] = json?.local_results ?? (json?.place_results ? [json.place_results] : [])
  const places = results.slice(0, 10).map((r): RawPlace => {
    const lat = num(r.gps_coordinates?.latitude)
    const lng = num(r.gps_coordinates?.longitude)
    return {
      name: String(r.title ?? r.name ?? "Place"),
      category: r.type ?? (Array.isArray(r.types) ? r.types[0] : undefined),
      rating: num(r.rating),
      reviews: num(r.reviews),
      price: r.price,
      address: r.address,
      image: enlarge(r.thumbnail),
      link:
        safeHttpUrl(r.website) ??
        safeHttpUrl(r.links?.website) ??
        `https://www.google.com/maps/search/${encodeURIComponent(`${r.title ?? query} ${near}`)}`,
      lat,
      lng,
      hours: typeof r.hours === "string" ? r.hours : typeof r.open_state === "string" ? r.open_state : undefined,
      distanceKm:
        center && lat !== undefined && lng !== undefined
          ? Math.round(haversineKm(center, { lat, lng }) * 10) / 10
          : undefined,
    }
  })
  return { places, center }
}

export type DirectionsLeg = {
  mode: string
  title: string
  durationMin: number
  operator?: string
  fromStop?: string
  toStop?: string
  departs?: string
  arrives?: string
  stops?: number
  /** True for rail legs, false for buses and everything else. */
  rail: boolean
}

export type DirectionsOption = {
  /** SerpApi's own label: "Driving", "Transit", "Two-wheeler", "Walking". */
  travelMode: string
  distanceKm: number
  durationMin: number
  via?: string
  typicalRange?: string
  notes: string[]
  departs?: string
  arrives?: string
  legs: DirectionsLeg[]
}

/**
 * Routes between two places for one travel mode. SerpApi's codes: 0 driving
 * (best), 3 public transport, 9 two-wheeler, 2 walking.
 */
export async function fetchDirections(
  tripId: string,
  from: string,
  to: string,
  travelMode: 0 | 2 | 3 | 9
): Promise<{ options: DirectionsOption[]; start?: GeoPoint; end?: GeoPoint }> {
  const json = await serpFetch(
    tripId,
    "google_maps_directions",
    { start_addr: from, end_addr: to, travel_mode: travelMode, hl: "en" },
    3
  )
  if (!json) return { options: [] }

  const places: any[] = json.places_info ?? []
  const point = (p?: any): GeoPoint | undefined =>
    p?.gps_coordinates
      ? { name: String(p.address ?? ""), lat: p.gps_coordinates.latitude, lng: p.gps_coordinates.longitude }
      : undefined

  const options = ((json.directions as any[]) ?? []).map((d): DirectionsOption => {
    const legs: DirectionsLeg[] = ((d.trips as any[]) ?? [])
      .filter((t) => t.travel_mode === "Transit" || t.travel_mode === "Walking")
      .map((t) => {
        const icon = String(t.icon ?? "")
        const operator = t.service_run_by?.name
        return {
          mode: String(t.travel_mode),
          title: String(t.title ?? ""),
          durationMin: Math.round((num(t.duration) ?? 0) / 60),
          operator: operator ? String(operator) : undefined,
          fromStop: t.start_stop?.name,
          toStop: t.end_stop?.name,
          departs: t.start_stop?.time,
          arrives: t.end_stop?.time,
          stops: num(t.stops),
          rail: /rail|train|subway|tram/i.test(icon) || /railway|rail/i.test(String(operator ?? "")),
        }
      })
    return {
      travelMode: String(d.travel_mode ?? "Driving"),
      distanceKm: Math.round(((num(d.distance) ?? 0) / 1000) * 10) / 10,
      durationMin: Math.round((num(d.duration) ?? 0) / 60),
      via: d.via,
      typicalRange: d.typical_duration_range,
      notes: Array.isArray(d.extensions) ? d.extensions.map(String).slice(0, 3) : [],
      departs: d.start_time,
      arrives: d.end_time,
      legs,
    }
  })
  return { options, start: point(places[0]), end: point(places[1]) }
}

export type WebSnippet = { title: string; snippet: string; link: string }

/** A Google web search, reduced to what a model needs to quote a fact: titles, snippets, links. */
export async function webSearch(
  tripId: string,
  query: string,
  gl = "in"
): Promise<{ answer?: string; results: WebSnippet[]; questions: { question: string; snippet: string }[] }> {
  const json = await serpFetch(tripId, "google", { q: query, hl: "en", gl }, 5)
  if (!json) return { results: [], questions: [] }
  const box = json.answer_box
  const answer: string | undefined = box?.answer ?? box?.snippet ?? box?.result
  return {
    answer: typeof answer === "string" ? answer.slice(0, 400) : undefined,
    results: ((json.organic_results as any[]) ?? [])
      .slice(0, 6)
      .map((r) => ({
        title: String(r.title ?? ""),
        snippet: String(r.snippet ?? "").slice(0, 320),
        link: safeHttpUrl(r.link) ?? "",
      }))
      .filter((r) => r.title && r.snippet),
    questions: ((json.related_questions as any[]) ?? [])
      .slice(0, 3)
      .map((q) => ({ question: String(q.question ?? ""), snippet: String(q.snippet ?? "").slice(0, 280) }))
      .filter((q) => q.question && q.snippet),
  }
}


/** A live exchange rate from Google's converter ("1000 LKR to INR"), or null if it isn't available. */
export async function convertCurrency(
  tripId: string,
  amount: number,
  from: string,
  to: string
): Promise<{ amount: number; from: string; to: string; converted: number; asOf?: string } | null> {
  const clean = (c: string) => c.trim().toUpperCase().slice(0, 3)
  const json = await serpFetch(tripId, "google", { q: `${amount} ${clean(from)} to ${clean(to)}`, hl: "en" }, 1)
  const box = json?.answer_box
  const converted = num(box?.currency_converter?.to?.price ?? box?.price)
  if (box?.type !== "currency_converter" || converted === undefined) return null
  return { amount, from: clean(from), to: clean(to), converted: Math.round(converted * 100) / 100, asOf: box.date }
}
