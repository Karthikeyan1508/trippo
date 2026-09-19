/* eslint-disable @typescript-eslint/no-explicit-any */
import { addDays } from "date-fns"

import { prisma } from "@/lib/prisma"

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
  params: SerpParams
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
      expiresAt: addDays(new Date(), CACHE_TTL_DAYS),
    },
    update: {
      params: params as any,
      response: json,
      fetchedAt: new Date(),
      expiresAt: addDays(new Date(), CACHE_TTL_DAYS),
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
