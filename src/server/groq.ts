/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ResearchBundle } from "@/server/serpapi"
import type { RoutePlan } from "@/server/route-planner"

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
  /** Coordinates and source for the place, when the route planner already knows them. */
  geo?: { lat: number; lng: number; address?: string; rating?: number; engine?: string; url?: string }
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
    transports: Record<string, number>
    avgBudgetPerDay?: number | null
    mustCover: string[]
    /** Free-text accessibility / medical needs the group must plan around. */
    accessibility: string[]
  }
  /** The stay the group already picked, if any, the plan should be built around it. */
  chosenStay?: { name: string; price?: string | null } | null
  research: ResearchBundle
  /** The optimised route (bases, flights, daily windows and stops). When present, the model only writes around it. */
  route?: RoutePlan | null
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
- Treat group.accessibility as hard constraints: avoid stops or transfers that conflict with any listed need (e.g. long treks, stairs-only sites) and say so in the "why".
- Favour the group's preferred transports (group.transports) for travel legs.
- If chosenStay is provided, the group has already picked it: use it as the STAY item (placeName = its exact name) and keep each day's route sensible around it.
- Use 24h times like "09:30". Keep descriptions concise.
- Produce exactly the requested number of days.`

const ROUTED_PROMPT = `You are an expert group-travel planner finishing a day-by-day itinerary whose ROUTE is already decided.
A route planner has fixed where the group sleeps, how they travel (flights, airport and base-to-base transfers) and which places to visit each day, in an order that avoids backtracking. You write the days around that.

Hard rules:
- For each day output ONLY free-time items: activities, meals, a cafe or rest. Do NOT output flights, airport transfers or transfers between bases: they appear under "fixed" and are added for you.
- Activities: use ONLY the places under that day's "stops", in exactly the order given, with the exact name in "placeName". You may skip a stop if the day gets too full. Never add other places and never reorder.
- Meals (breakfast, lunch, dinner) wherever the day's window allows. Use a name from "restaurants" in "placeName" when it fits; otherwise leave placeName empty and name the area in the title.
- Every item must start inside the day's window (24h "HH:MM"), after any fixed item that precedes it, and must not overlap one. Leave realistic gaps for travel: "kmFromPrev" is the road distance from the previous stop (assume 40 km/h).
- Respect the group's pace: if relaxed, do not fill every slot. Respect diet, interests and accessibility needs.
- Give every item a one-sentence "why" that ties it to the group or the place.
- Return exactly one day per entry in route.days, with the same dayNumber, and a one-sentence day "summary".
- Never use the em dash character.`

const BASES_TOOL = {
  type: "function",
  function: {
    name: "propose_bases",
    description: "Return the overnight bases for the trip.",
    parameters: {
      type: "object",
      properties: {
        bases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "A town or area that can be looked up on a map, with the country, e.g. 'Kandy, Sri Lanka'." },
              nights: { type: "integer" },
              why: { type: "string" },
            },
            required: ["name", "nights"],
          },
        },
      },
      required: ["bases"],
    },
  },
}

/**
 * Asks the model which towns to sleep in. Only the choice of towns is the
 * model's: distances, ordering and feasibility are checked in code afterwards.
 */
export async function proposeBasesWithGroq(input: {
  destination: string
  gatewayLabel: string
  arrival: "flight" | "road" | "none"
  days: number
  nights: number
  maxBases: number
  maxLegMinutes: number
  radiusKm: number
  pace: string
  interests: string[]
  mustCover: string[]
}): Promise<{ name: string; nights: number; why?: string }[] | null> {
  if (!hasGroq()) return null
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b"
  const system = `You choose where a group sleeps on a short trip so the route is compact and easy.
Rules:
- The trip starts and ends at "${input.gatewayLabel}" (${input.arrival === "flight" ? "the arrival airport city" : "the starting point"}), so the route is a loop. Never make the group backtrack along the same road more than once.
- Every base must be inside "${input.destination}" itself, within about ${input.radiusKm} km of its centre. Never choose a stopover or a neighbouring town outside it: the group chose this destination.
- Use at most ${input.maxBases} base${input.maxBases === 1 ? "" : "s"}. Total nights across bases must equal ${input.nights}; every base gets at least one night.
- No single leg (the gateway to the first base, base to base, last base back to the gateway) may take longer than ${Math.round(input.maxLegMinutes / 60 * 10) / 10} hours by road.
- A base should have plenty to see within about 30 km of it, so the group does not need long drives on non-travel days.
- Short trips (3 days or fewer) should stay in ONE base, ideally the gateway city or right next to it. Do not pick far-flung places a short trip cannot reach comfortably.
- Name each base as a well-known town plus country so it can be found on a map.
- Never use the em dash character.`
  const user = `Destination: ${input.destination}. Trip length: ${input.days} days (${input.nights} nights). Pace: ${input.pace}. Interests: ${input.interests.join(", ") || "general sightseeing"}. Must cover: ${input.mustCover.join("; ") || "nothing specific"}.`

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 4000,
        ...(model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [BASES_TOOL],
        tool_choice: { type: "function", function: { name: "propose_bases" } },
      }),
      cache: "no-store",
    })
    if (!res.ok) {
      console.error("Groq bases error:", res.status, await res.text())
      return null
    }
    const json = await res.json()
    const args = JSON.parse(json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "null")
    const list = Array.isArray(args?.bases) ? args.bases : []
    return list
      .filter((b: any) => b && typeof b.name === "string" && b.name.trim())
      .map((b: any) => ({
        name: String(b.name).trim(),
        nights: Math.max(1, Math.round(Number(b.nights) || 1)),
        why: typeof b.why === "string" ? b.why : undefined,
      }))
  } catch (err) {
    console.error("Groq bases request failed:", err)
    return null
  }
}

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

  const routed = ctx.route && ctx.route.days.length > 0 ? ctx.route : null
  const routedPayload = routed
    ? {
        headline: routed.headline,
        days: routed.days.map((d) => ({
          dayNumber: d.day,
          date: d.date,
          base: d.base,
          window: d.window,
          maxStops: d.maxStops,
          fixed: d.fixed.map((f) => ({ time: f.startTime, title: f.title })),
          stops: d.candidates.map((c) => ({
            placeName: c.title,
            rating: c.rating ?? null,
            category: c.category ?? null,
            kmFromPrev: c.kmFromPrev,
          })),
          restaurants: d.restaurants.map((r) => r.title),
        })),
      }
    : null

  const body: Record<string, unknown> = {
    model,
    temperature: 0.5,
    // Big enough for a full multi-day itinerary; gpt-oss is a reasoning model,
    // so without this the tool-call JSON gets truncated and fails to parse.
    max_tokens: 16000,
    ...(model.includes("gpt-oss") ? { reasoning_effort: "medium" } : {}),
    messages: [
      { role: "system", content: routed ? ROUTED_PROMPT : SYSTEM_PROMPT },
      routed
        ? {
            role: "user",
            content: `Write the free-time items for this ${ctx.days}-day ${ctx.tripType.toLowerCase()} trip to ${ctx.destination}.\n\nGroup and route (JSON):\n${JSON.stringify(
              {
                group: ctx.group,
                chosenStay: ctx.chosenStay ?? null,
                budgetPerPerson: ctx.budgetPerPerson,
                currency: ctx.currency,
                route: routedPayload,
              },
              null,
              0
            )}`,
          }
        : {
        role: "user",
        content: `Plan a ${ctx.days}-day ${ctx.tripType.toLowerCase()} trip to ${ctx.destination}${
          ctx.originCity ? ` from ${ctx.originCity}` : ""
        } (${ctx.startDate} to ${ctx.endDate}).\n\nGroup & data (JSON):\n${JSON.stringify(
          {
            group: ctx.group,
            chosenStay: ctx.chosenStay ?? null,
            budgetPerPerson: ctx.budgetPerPerson,
            currency: ctx.currency,
            research: ctx.research,
          },
          null,
          0
        )}`,
      },
    ],
    tools: [TOOL],
    tool_choice: { type: "function", function: { name: "generate_itinerary" } },
  }

  // The model occasionally answers with the days as plain JSON instead of calling the
  // tool, which the API rejects but echoes back in `failed_generation`. That text is a
  // perfectly good plan, so use it; otherwise try once more.
  for (let attempt = 0; attempt < 2; attempt++) {
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
        const text = await res.text()
        console.error("Groq error:", res.status, text.slice(0, 300))
        const recovered = recoverFailedGeneration(text)
        if (recovered) return recovered
        continue
      }
      const json = await res.json()
      const call = json?.choices?.[0]?.message?.tool_calls?.[0]
      if (!call?.function?.arguments) continue
      const parsed = normalize(JSON.parse(call.function.arguments))
      if (parsed) return parsed
    } catch (err) {
      console.error("Groq request failed:", err)
    }
  }
  return null
}

/** Pulls a plan out of a rejected tool call's `failed_generation` text, if it holds one. */
function recoverFailedGeneration(responseText: string): GeneratedItinerary | null {
  try {
    const failed = JSON.parse(responseText)?.error?.failed_generation
    if (typeof failed !== "string") return null
    const payload = JSON.parse(failed)
    if (Array.isArray(payload)) return normalize({ summary: "Your group itinerary.", days: payload })
    if (payload && Array.isArray(payload.days)) return normalize(payload)
    if (payload?.arguments && Array.isArray(payload.arguments.days)) return normalize(payload.arguments)
  } catch {
    /* not recoverable */
  }
  return null
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

// ── Cinematic trip narration (voiceover script) ────────────────────────

export type NarrationScene = {
  day: number
  title: string
  placeName?: string | null
  time?: string | null
  category: string
}

export type TripNarration = { intro: string; outro: string; lines: string[] }

const NARRATE_TOOL = {
  type: "function",
  function: {
    name: "narrate_trip",
    description: "Return a cinematic voiceover script for a trip recap.",
    parameters: {
      type: "object",
      properties: {
        intro: { type: "string" },
        outro: { type: "string" },
        lines: { type: "array", items: { type: "string" } },
      },
      required: ["intro", "outro", "lines"],
    },
  },
}

export async function narrateTrip(input: {
  destination: string
  days: number
  tripType: string
  scenes: NarrationScene[]
}): Promise<TripNarration | null> {
  if (!hasGroq()) return null
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b"

  const system = `You are a warm, cinematic travel narrator recording a voiceover for a short trip-recap video.
Write ONE vivid, flowing sentence per stop (max ~22 words), in second person ("you"), that names the place naturally and evokes the moment.
Also write a 1-sentence intro that sets the scene and a 1-sentence closing outro.
Return exactly one line per stop, in order, via the narrate_trip function.`

  const scenesText = input.scenes
    .map(
      (s, i) =>
        `${i + 1}. [Day ${s.day}${s.time ? `, ${s.time}` : ""}] ${s.title}${
          s.placeName && s.placeName !== s.title ? ` (${s.placeName})` : ""
        }`
    )
    .join("\n")

  const body: Record<string, unknown> = {
    model,
    temperature: 0.7,
    max_tokens: 4000,
    ...(model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `A ${input.days}-day ${input.tripType.toLowerCase()} trip to ${input.destination}. Narrate these ${input.scenes.length} stops in order:\n${scenesText}`,
      },
    ],
    tools: [NARRATE_TOOL],
    tool_choice: { type: "function", function: { name: "narrate_trip" } },
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
      console.error("Groq narrate error:", res.status, await res.text())
      return null
    }
    const json = await res.json()
    const call = json?.choices?.[0]?.message?.tool_calls?.[0]
    if (!call?.function?.arguments) return null
    const args = JSON.parse(call.function.arguments)
    const lines: string[] = Array.isArray(args.lines)
      ? args.lines.map((l: unknown) => String(l))
      : []
    return {
      intro: typeof args.intro === "string" ? args.intro : "",
      outro: typeof args.outro === "string" ? args.outro : "",
      lines,
    }
  } catch (err) {
    console.error("Groq narrate request failed:", err)
    return null
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
        } (${ctx.startDate}-${ctx.endDate}). Group interests: ${
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


// ── Gear & shopping ideas ───────────────────────────────────────────────

export type GearIdeaOut = { query: string; label: string; reason: string }

export type GearIdeaContext = {
  destination: string
  tripType: string
  startDate: string
  endDate: string
  days: number
  interests: string[]
  /** Free-text accessibility / medical needs to respect when suggesting gear. */
  accessibility: string[]
  /** A sample of planned activities, to ground the suggestions. */
  activities: string[]
}

const GEAR_SYSTEM = `You are a thoughtful travel-gear advisor for a group trip.
Return 6-8 shopping ideas via the gear_ideas function. Each idea has:
- query: a concise Amazon search phrase (generic product type; avoid brand names).
- label: a 2-4 word chip title.
- reason: ONE short sentence tying it to THIS trip. The season, the destination's climate, the planned activities or the group's needs.
Prioritise practical, packable items people forget. No duplicates. Skip obvious basics (toothbrush, clothes) unless the trip makes them special.
Respect any accessibility notes (e.g. suggest supportive footwear for knee trouble).`

const GEAR_TOOL = {
  type: "function",
  function: {
    name: "gear_ideas",
    description: "Return shopping ideas tailored to the trip.",
    parameters: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              query: { type: "string" },
              label: { type: "string" },
              reason: { type: "string" },
            },
            required: ["query", "label", "reason"],
          },
        },
      },
      required: ["ideas"],
    },
  },
}

export async function suggestGearWithGroq(
  ctx: GearIdeaContext
): Promise<GearIdeaOut[] | null> {
  if (!hasGroq()) return null
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b"

  const body: Record<string, unknown> = {
    model,
    temperature: 0.5,
    max_tokens: 4000,
    ...(model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
    messages: [
      { role: "system", content: GEAR_SYSTEM },
      {
        role: "user",
        content: `Trip: ${ctx.days}-day ${ctx.tripType.toLowerCase()} trip to ${ctx.destination} (${ctx.startDate} to ${ctx.endDate}).
Group interests: ${ctx.interests.join(", ") || "general sightseeing"}.
Accessibility notes: ${ctx.accessibility.join("; ") || "none"}.
Planned activities: ${ctx.activities.join("; ") || "not planned yet"}.`,
      },
    ],
    tools: [GEAR_TOOL],
    tool_choice: { type: "function", function: { name: "gear_ideas" } },
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
      console.error("Groq gear error:", res.status, await res.text())
      return null
    }
    const json = await res.json()
    const call = json?.choices?.[0]?.message?.tool_calls?.[0]
    if (!call?.function?.arguments) return null
    const parsed = JSON.parse(call.function.arguments)
    const ideas: GearIdeaOut[] = (Array.isArray(parsed?.ideas) ? parsed.ideas : [])
      .map((i: any) => ({
        query: String(i?.query ?? "").trim().slice(0, 80),
        label: String(i?.label ?? "").trim().slice(0, 40),
        reason: String(i?.reason ?? "").trim().slice(0, 200),
      }))
      .filter((i: GearIdeaOut) => i.query.length >= 3 && i.label && i.reason)
      .slice(0, 8)
    return ideas.length > 0 ? ideas : null
  } catch (err) {
    console.error("Groq gear request failed:", err)
    return null
  }
}
