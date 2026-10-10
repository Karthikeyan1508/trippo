/**
 * Shared shapes for the crew chat. Plain module (no React, no server code) so the
 * server that creates messages and the client that renders them agree on one list.
 */

export const TRIPPO_HANDLE = "trippo"

// ── What Trippo can put in a message ────────────────────────────────────

export type HotelItem = {
  /** Stable within its message: how an action ("add this", "poll these") names it. */
  key: string
  name: string
  rating?: number
  reviews?: number
  /** Nightly price as the store shows it, e.g. "₹8,128". */
  priceNight?: string
  priceValue?: number
  /** Total for the dates searched. */
  priceTotal?: string
  /** 1 to 5. */
  stars?: number
  amenities: string[]
  image?: string
  link?: string
  lat?: number
  lng?: number
  /** Straight-line km from the area the question was about. */
  distanceKm?: number
  /** "Gangaramaya Temple: 7 min walk" style lines. */
  nearby: string[]
  checkIn?: string
  checkOut?: string
  /** One-line reason Trippo picked it. */
  why?: string
  /** "Top rated", "Best value", "Closest". */
  badge?: string
}

export type TransportMode = "cab" | "train" | "bus" | "bike" | "tuktuk" | "walk" | "flight" | "ferry" | "other"

export type TransportItem = {
  key: string
  mode: TransportMode
  title: string
  operator?: string
  durationMin?: number
  distanceKm?: number
  /** "3:35 PM" style clock strings, when the route is a scheduled service. */
  departs?: string
  arrives?: string
  /** Boarding and alighting points for scheduled services. */
  fromStop?: string
  toStop?: string
  /** "via Kandy Rd / A1". */
  route?: string
  /** A fare or price range as text, e.g. "Rs 1,200 to 3,000 (1st class)". */
  cost?: string
  /** Whether the cost came from a web source or is Trippo's own rough guess. */
  costNote?: "reported" | "estimate"
  pros: string[]
  cons: string[]
  /** "Fastest", "Cheapest", "Most scenic". */
  tags: string[]
  note?: string
  link?: string
  /** Where the numbers came from: "Google Maps" or "Web". */
  source?: string
}

export type PlaceItem = {
  key: string
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
  why?: string
  distanceKm?: number
}

export type VideoItem = {
  key: string
  /** YouTube's own id: the thumbnail and the player come from it. */
  videoId: string
  title: string
  channel: string
  /** "12:30" as YouTube shows it. */
  length?: string
  views?: number
  /** "2y ago". */
  published?: string
  link: string
  thumbnail: string
  /** The stop in the plan this video is about. */
  forStop: string
  /** Why it matches, worked out from the video's own title and description. */
  match: string
}

export type HotelsCard = {
  id: string
  type: "hotels"
  title: string
  area?: string
  /** The dates the prices are for. */
  stay?: { checkIn: string; checkOut: string; nights: number; guests: number }
  items: HotelItem[]
}
export type TransportCard = {
  id: string
  type: "transport"
  title: string
  from: string
  to: string
  distanceKm?: number
  items: TransportItem[]
}
export type PlacesCard = { id: string; type: "places"; title: string; area?: string; items: PlaceItem[] }

export type VideosCard = { id: string; type: "videos"; title: string; items: VideoItem[] }

export type ChatCard = HotelsCard | TransportCard | PlacesCard | VideosCard

export type CardItem = HotelItem | TransportItem | PlaceItem | VideoItem

export type AiStep = { label: string; done: boolean }

/** The body of a Trippo message. */
export type AiPayload = {
  askedById: string
  question: string
  steps: AiStep[]
  cards: ChatCard[]
  followUps: string[]
  error?: string
}

/** The body of a system notice. */
export type NoticePayload = {
  event: "added" | "approved" | "declined" | "poll_closed" | "poll_opened" | "stay_saved"
  dayNumber?: number
  itemName?: string
}

// ── What the client receives ───────────────────────────────────────────

export type ChatAuthor = { id: string; name: string; image: string | null }

export type PollOptionDTO = {
  label: string
  count: number
  /** Suggestion details when the poll came from an AI card (name, price, image...). */
  item?: { kind: string; title: string; subtitle?: string; image?: string; link?: string; rating?: number }
}

export type PollDTO = {
  id: string
  question: string
  options: PollOptionDTO[]
  totalVotes: number
  /** Who has voted (not what they chose: choices stay private). */
  votedUserIds: string[]
  myVote: string | null
  closed: boolean
  closesAt: string | null
  createdById: string
  /** The winning label(s) once closed with votes. */
  winners: string[]
  /** The AI card this poll was started from, if any. */
  source: { messageId: string; cardId: string } | null
  /** True when options carry enough detail to add the winner to the itinerary. */
  canAddWinner: boolean
  /** What happened to the winner since: added to the plan, or waiting for an admin. */
  winnerState: ItemState | null
}

export type RequestDTO = {
  id: string
  status: "PENDING" | "APPROVED" | "DECLINED"
  kind: "hotel" | "transport" | "place"
  title: string
  subtitle?: string
  image?: string
  requestedBy: ChatAuthor
  decidedByName?: string
  dayNumber: number | null
  startTime: string | null
  note: string | null
}

/** Where an AI card item stands: used to show "In a poll", "Waiting for admin", "Added to Day 2". */
export type ItemState =
  | { kind: "poll"; pollMessageId: string; closed: boolean }
  | { kind: "pending"; requestId: string; by: string }
  | { kind: "added"; dayNumber: number | null }
  | { kind: "declined" }

export type ChatMessageDTO = {
  id: string
  kind: "TEXT" | "AI" | "POLL" | "SYSTEM" | "REQUEST"
  body: string
  createdAt: string
  updatedAt: string
  status: string
  author: ChatAuthor | null
  replyTo: { id: string; authorName: string; snippet: string } | null
  mentionIds: string[]
  payload: AiPayload | NoticePayload | null
  poll: PollDTO | null
  request: RequestDTO | null
  /** For AI messages: the standing of each card item, keyed by item key. */
  itemStates: Record<string, ItemState>
}

export type ChatSnapshot = {
  messages: ChatMessageDTO[]
  /** True when older messages exist beyond what was returned. */
  hasMore: boolean
  /** Server clock, to use as the next `since` (avoids client clock skew). */
  now: string
  unread: number
}

// ── Mentions ───────────────────────────────────────────────────────────

export type MentionTarget = { id: string; name: string }

const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? name

/** Does this message address Trippo? ("@trippo", any case, as a whole word). */
export function addressesTrippo(text: string): boolean {
  return /(^|[^\w])@trippo\b/i.test(text)
}

/** The text with the "@trippo" handle removed: what is actually being asked. */
export function stripTrippo(text: string): string {
  return text.replace(/(^|[^\w])@trippo\b[,:]?\s*/gi, "$1").trim()
}

/** The crew members a message names with "@Name" (first names, whole words, any case). */
export function mentionedIds(text: string, crew: MentionTarget[]): string[] {
  const ids = new Set<string>()
  for (const match of text.matchAll(/(^|[^\w])@([\p{L}][\p{L}'’-]*)/gu)) {
    const handle = match[2].toLowerCase()
    if (handle === TRIPPO_HANDLE) continue
    for (const member of crew) {
      if (firstWord(member.name).toLowerCase() === handle) ids.add(member.id)
    }
  }
  return [...ids]
}

export function mentionHandle(name: string): string {
  return firstWord(name)
}

// ── Small formatters used on both sides ───────────────────────────────

export function formatMinutes(minutes: number | undefined): string {
  if (minutes === undefined || !Number.isFinite(minutes)) return ""
  const m = Math.max(1, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${m} min`
  if (rest === 0) return `${h} h`
  return `${h} h ${rest} min`
}

/** A short single-line preview of a message for reply quotes and notifications. */
export function snippet(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}
