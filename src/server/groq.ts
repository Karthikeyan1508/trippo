/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ResearchBundle } from "@/server/serpapi"

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

export const ITEM_CATEGORIES = [
  "TRAVEL",
  "STAY",
  "FOOD",
  "ACTIVITY",
  "SHOPPING",
  "EVENT",
  "OTHER",
] as const

export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export type GeneratedItem = {
  startTime?: string
  endTime?: string
  title: string
  description?: string
  category: ItemCategory
  placeName?: string
  why?: string
}

export type GeneratedDay = {
  dayNumber: number
  title?: string
  summary?: string
  items: GeneratedItem[]
}

export type GeneratedItinerary = {
  summary: string
  days: GeneratedDay[]
}

export type ItineraryContext = {
  destination: string
  originCity?: string | null
  startDate: string
  endDate: string
  days: number
  tripType: string
  currency: string
  budgetPerPerson?: number | null
  group: {
    memberCount: number
    diet: Record<string, number>
    pace: Record<string, number>
    interests: Record<string, number>
    stayTypes: Record<string, number>
    avgBudgetPerDay?: number | null
    mustCover: string[]
  }
  research: ResearchBundle
}

export function hasGroq() {
  return Boolean(process.env.GROQ_API_KEY)
}

const SYSTEM_PROMPT = `You are an expert group-travel planner.
You are given a destination, the group's aggregated preferences, and REAL place/hotel/restaurant/event data pulled from Google via SerpApi.
Build a realistic, well-paced day-by-day itinerary by calling the generate_itinerary function.

Rules:
- Prefer places, restaurants and events from the provided data. Use their exact names in "placeName".
- Respect the group's diet split, pace and interests. If the group leans relaxed, schedule fewer items per day.
- Order each day sensibly by time and keep travel between stops reasonable.
- For every item, give a short "why" that ties back to the group's preferences or the place's rating.
- Cover meals (breakfast/lunch/dinner) using the restaurant data where possible.
- Use 24h times like "09:30". Keep descriptions concise.
- Produce exactly the requested number of days.`

const TOOL = {
  type: "function",
  function: {
    name: "generate_itinerary",
    description: "Return the full day-by-day group itinerary.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "1-2 sentence overview of the trip plan.",
        },
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dayNumber: { type: "integer" },
              title: { type: "string" },
              summary: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startTime: { type: "string" },
                    endTime: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    category: { type: "string", enum: ITEM_CATEGORIES as unknown as string[] },
                    placeName: { type: "string" },
                    why: { type: "string" },
                  },
                  required: ["title", "category"],
                },
              },
            },
            required: ["dayNumber", "items"],
          },
        },
      },
      required: ["summary", "days"],
    },
  },
}

function coerceCategory(v: unknown): ItemCategory {
  const up = String(v ?? "").toUpperCase()
  return (ITEM_CATEGORIES as readonly string[]).includes(up)
    ? (up as ItemCategory)
    : "ACTIVITY"
}

function normalize(args: any): GeneratedItinerary | null {
  if (!args || !Array.isArray(args.days)) return null
  const days: GeneratedDay[] = args.days
    .map((d: any, i: number) => ({
      dayNumber: Number(d.dayNumber) || i + 1,
      title: typeof d.title === "string" ? d.title : undefined,
      summary: typeof d.summary === "string" ? d.summary : undefined,
      items: Array.isArray(d.items)
        ? d.items
            .filter((it: any) => it && typeof it.title === "string")
            .map((it: any) => ({
              startTime: it.startTime ? String(it.startTime) : undefined,
              endTime: it.endTime ? String(it.endTime) : undefined,
              title: String(it.title),
              description: it.description ? String(it.description) : undefined,
              category: coerceCategory(it.category),
              placeName: it.placeName ? String(it.placeName) : undefined,
              why: it.why ? String(it.why) : undefined,
            }))
        : [],
    }))
    .sort((a: GeneratedDay, b: GeneratedDay) => a.dayNumber - b.dayNumber)

  if (days.length === 0) return null
  return {
    summary: typeof args.summary === "string" ? args.summary : "Your group itinerary.",
    days,
  }
}

export async function generateItineraryWithGroq(
  ctx: ItineraryContext
): Promise<GeneratedItinerary | null> {
  if (!hasGroq()) return null
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b"

  const body: Record<string, unknown> = {
    model,
    temperature: 0.5,
    // Big enough for a full multi-day itinerary; gpt-oss is a reasoning model,
    // so without this the tool-call JSON gets truncated and fails to parse.
    max_tokens: 16000,
    ...(model.includes("gpt-oss") ? { reasoning_effort: "medium" } : {}),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Plan a ${ctx.days}-day ${ctx.tripType.toLowerCase()} trip to ${ctx.destination}${
          ctx.originCity ? ` from ${ctx.originCity}` : ""
        } (${ctx.startDate} to ${ctx.endDate}).\n\nGroup & data (JSON):\n${JSON.stringify(
          { group: ctx.group, budgetPerPerson: ctx.budgetPerPerson, currency: ctx.currency, research: ctx.research },
          null,
          0
        )}`,
      },
    ],
    tools: [TOOL],
    tool_choice: { type: "function", function: { name: "generate_itinerary" } },
  }

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })
    if (!res.ok) {
      console.error("Groq error:", res.status, await res.text())
      return null
    }
    const json = await res.json()
    const call = json?.choices?.[0]?.message?.tool_calls?.[0]
    if (!call?.function?.arguments) return null
    return normalize(JSON.parse(call.function.arguments))
  } catch (err) {
    console.error("Groq request failed:", err)
    return null
  }
}

// ── Pre-trip prep pack ──────────────────────────────────────────────────

export type PrepPack = {
  summary: string
  etiquette: string[]
  documents: string[]
  packing: { category: string; items: string[] }[]
  phrases: { phrase: string; meaning: string }[]
}

export type PrepContext = {
  destination: string
  originCity?: string | null
  startDate: string
  endDate: string
  days: number
  tripType: string
  interests: string[]
  webTips?: string
}

const PREP_SYSTEM = `You are a seasoned travel-prep assistant.
Given a destination and trip details, return a practical pre-trip prep pack via the trip_prep function.
- etiquette: 5-8 concrete local customs, dress-code and safety tips specific to the destination.
- documents: IDs, permits, tickets and paperwork travellers should carry (be destination-appropriate).
- packing: 3-5 categories (e.g. Clothing, Toiletries, Gear, Documents) each with specific items, tuned to the trip type, season and activities.
- phrases: 4-6 useful local-language phrases with meanings (skip if the destination is English-speaking).
Keep everything specific and actionable.`

const PREP_TOOL = {
  type: "function",
  function: {
    name: "trip_prep",
    description: "Return a practical pre-trip prep pack.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        etiquette: { type: "array", items: { type: "string" } },
        documents: { type: "array", items: { type: "string" } },
        packing: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              items: { type: "array", items: { type: "string" } },
            },
            required: ["category", "items"],
          },
        },
        phrases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              phrase: { type: "string" },
              meaning: { type: "string" },
            },
            required: ["phrase", "meaning"],
          },
        },
      },
      required: ["summary", "etiquette", "documents", "packing"],
    },
  },
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
}

function normalizePrep(args: any): PrepPack | null {
  if (!args) return null
  const packing = Array.isArray(args.packing)
    ? args.packing
        .filter((p: any) => p && typeof p.category === "string")
        .map((p: any) => ({ category: String(p.category), items: strArray(p.items) }))
    : []
  const phrases = Array.isArray(args.phrases)
    ? args.phrases
        .filter((p: any) => p && p.phrase && p.meaning)
        .map((p: any) => ({ phrase: String(p.phrase), meaning: String(p.meaning) }))
    : []
  return {
    summary: typeof args.summary === "string" ? args.summary : "",
    etiquette: strArray(args.etiquette),
    documents: strArray(args.documents),
    packing,
    phrases,
  }
}

export async function generatePrepWithGroq(
  ctx: PrepContext
): Promise<PrepPack | null> {
  if (!hasGroq()) return null
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b"

  const body: Record<string, unknown> = {
    model,
    temperature: 0.4,
    max_tokens: 8000,
    ...(model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
    messages: [
      { role: "system", content: PREP_SYSTEM },
      {
        role: "user",
        content: `Prep a ${ctx.days}-day ${ctx.tripType.toLowerCase()} trip to ${ctx.destination}${
          ctx.originCity ? ` from ${ctx.originCity}` : ""
        } (${ctx.startDate}–${ctx.endDate}). Group interests: ${
          ctx.interests.join(", ") || "general sightseeing"
        }.${ctx.webTips ? `\n\nWeb notes:\n${ctx.webTips}` : ""}`,
      },
    ],
    tools: [PREP_TOOL],
    tool_choice: { type: "function", function: { name: "trip_prep" } },
  }

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })
    if (!res.ok) {
      console.error("Groq prep error:", res.status, await res.text())
      return null
    }
    const json = await res.json()
    const call = json?.choices?.[0]?.message?.tool_calls?.[0]
    if (!call?.function?.arguments) return null
    return normalizePrep(JSON.parse(call.function.arguments))
  } catch (err) {
    console.error("Groq prep request failed:", err)
    return null
  }
}
