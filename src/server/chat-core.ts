/* eslint-disable @typescript-eslint/no-explicit-any */
import { format } from "date-fns"
import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { numberStops } from "@/lib/stops"
import { tripUrl } from "@/lib/notifications"
import { notify } from "@/server/notify"
import { runTrippo } from "@/server/trippo-ai"
import {
  snippet,
  type AiPayload,
  type ChatAuthor,
  type ChatMessageDTO,
  type ChatSnapshot,
  type ItemState,
  type NoticePayload,
  type PollDTO,
  type RequestDTO,
} from "@/lib/chat"

/**
 * The parts of the crew chat that aren't server actions themselves: turning rows into what
 * the client shows, posting notices, closing polls on their deadline, and running Trippo.
 */

const AWAY_AFTER_MS = 25_000
const THINKING_TIMEOUT_MS = 3 * 60_000

type NameLike = { name: string | null; email: string | null }
export const displayName = (u: NameLike) => u.name ?? u.email?.split("@")[0] ?? "Member"

const authorOf = (u: (NameLike & { id: string; image: string | null }) | null): ChatAuthor | null =>
  u ? { id: u.id, name: displayName(u), image: u.image } : null

const messageInclude = {
  author: { select: { id: true, name: true, email: true, image: true } },
  replyTo: {
    select: {
      id: true,
      body: true,
      kind: true,
      author: { select: { name: true, email: true } },
    },
  },
  poll: { include: { votes: { select: { userId: true, option: true } } } },
  request: {
    include: {
      requestedBy: { select: { id: true, name: true, email: true, image: true } },
      decidedBy: { select: { name: true, email: true } },
    },
  },
} satisfies Prisma.ChatMessageInclude

type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>

// ── Rows to what the client shows ───────────────────────────────────────

type PollMeta = {
  items?: Record<
    string,
    { itemKey?: string; kind: string; title: string; subtitle?: string; image?: string; link?: string; rating?: number; item?: unknown }
  >
}

function toPollDTO(
  poll: NonNullable<MessageRow["poll"]>,
  viewerId: string,
  states: Map<string, Record<string, ItemState>>
): PollDTO {
  const options = (poll.options as unknown as string[]) ?? []
  const meta = (poll.meta as PollMeta | null)?.items
  const counts = options.map((label) => poll.votes.filter((v) => v.option === label).length)
  const top = Math.max(0, ...counts)
  const closed = poll.closesAt !== null && poll.closesAt <= new Date()
  const winners = closed && top > 0 ? options.filter((_, i) => counts[i] === top) : []
  return {
    id: poll.id,
    question: poll.question,
    options: options.map((label, i) => {
      const m = meta?.[label]
      return {
        label,
        count: counts[i],
        item: m ? { kind: m.kind, title: m.title, subtitle: m.subtitle, image: m.image, link: m.link, rating: m.rating } : undefined,
      }
    }),
    totalVotes: poll.votes.length,
    votedUserIds: poll.votes.map((v) => v.userId),
    myVote: poll.votes.find((v) => v.userId === viewerId)?.option ?? null,
    closed,
    closesAt: poll.closesAt?.toISOString() ?? null,
    createdById: poll.createdById,
    winners,
    source: poll.sourceMessageId && poll.sourceCardId ? { messageId: poll.sourceMessageId, cardId: poll.sourceCardId } : null,
    canAddWinner: winners.length === 1 && Boolean(meta?.[winners[0]]?.item),
    winnerState: (() => {
      const key = winners.length === 1 ? meta?.[winners[0]]?.itemKey : undefined
      const state = key && poll.sourceMessageId ? states.get(poll.sourceMessageId)?.[key] : undefined
      // The poll itself is how the winner got here: only report what happened after it.
      return state && state.kind !== "poll" ? state : null
    })(),
  }
}

type Snapshot = { kind: "hotel" | "transport" | "place"; card?: { type: string; title: string; from?: string; to?: string }; item: any }

function toRequestDTO(r: NonNullable<MessageRow["request"]>): RequestDTO {
  const snap = r.item as unknown as Snapshot
  const item = snap?.item ?? {}
  const subtitle =
    snap?.kind === "hotel"
      ? [item.priceNight ? `${item.priceNight} per night` : null, item.rating ? `${item.rating} rating` : null].filter(Boolean).join(", ")
      : snap?.kind === "transport"
        ? [snap.card?.from && snap.card?.to ? `${snap.card.from} to ${snap.card.to}` : null, item.cost ?? null].filter(Boolean).join(", ")
        : [item.category, item.address].filter(Boolean).join(", ")
  return {
    id: r.id,
    status: r.status as RequestDTO["status"],
    kind: (snap?.kind ?? "place") as RequestDTO["kind"],
    title: String(item.name ?? item.title ?? "Suggestion"),
    subtitle: subtitle || undefined,
    image: item.image,
    requestedBy: authorOf(r.requestedBy) as ChatAuthor,
    decidedByName: r.decidedBy ? displayName(r.decidedBy) : undefined,
    dayNumber: r.dayNumber,
    startTime: r.startTime,
    note: r.note,
  }
}

function toDTO(m: MessageRow, viewerId: string, states: Map<string, Record<string, ItemState>>): ChatMessageDTO {
  const reply = m.replyTo
  return {
    id: m.id,
    kind: m.kind,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    status: m.status,
    author: authorOf(m.author),
    replyTo: reply
      ? { id: reply.id, authorName: reply.author ? displayName(reply.author) : "Trippo", snippet: snippet(reply.body || (reply.kind === "POLL" ? "A poll" : "A message"), 80) }
      : null,
    mentionIds: m.mentionIds,
    payload: (m.payload as unknown as AiPayload | NoticePayload | null) ?? null,
    poll: m.poll ? toPollDTO(m.poll, viewerId, states) : null,
    request: m.request ? toRequestDTO(m.request) : null,
    itemStates: states.get(m.id) ?? {},
  }
}

/** Where each AI card item stands: added, waiting for an admin, in a poll. */
async function itemStatesFor(aiIds: string[]): Promise<Map<string, Record<string, ItemState>>> {
  const out = new Map<string, Record<string, ItemState>>()
  if (aiIds.length === 0) return out
  const rank: Record<ItemState["kind"], number> = { declined: 0, poll: 1, pending: 2, added: 3 }
  const put = (messageId: string, key: string, state: ItemState) => {
    const bucket = out.get(messageId) ?? {}
    const current = bucket[key]
    if (!current || rank[state.kind] >= rank[current.kind]) bucket[key] = state
    out.set(messageId, bucket)
  }

  const [requests, polls] = await Promise.all([
    prisma.itineraryRequest.findMany({
      where: { messageId: { in: aiIds } },
      include: { requestedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.poll.findMany({
      where: { sourceMessageId: { in: aiIds } },
      include: { chatMessage: { select: { id: true } } },
    }),
  ])
  for (const r of requests) {
    if (!r.messageId || !r.itemKey) continue
    if (r.status === "APPROVED") put(r.messageId, r.itemKey, { kind: "added", dayNumber: r.dayNumber })
    else if (r.status === "PENDING") put(r.messageId, r.itemKey, { kind: "pending", requestId: r.id, by: displayName(r.requestedBy) })
    else put(r.messageId, r.itemKey, { kind: "declined" })
  }
  for (const p of polls) {
    if (!p.sourceMessageId || !p.chatMessage) continue
    const closed = p.closesAt !== null && p.closesAt <= new Date()
    const items = (p.meta as PollMeta | null)?.items ?? {}
    for (const entry of Object.values(items)) {
      if (entry.itemKey) put(p.sourceMessageId, entry.itemKey, { kind: "poll", pollMessageId: p.chatMessage.id, closed })
    }
  }
  return out
}

/** The AI messages whose card items need a status: the AI messages themselves and the sources of polls. */
function stateSourceIds(rows: MessageRow[]): string[] {
  const ids = new Set<string>()
  for (const r of rows) {
    if (r.kind === "AI") ids.add(r.id)
    if (r.poll?.sourceMessageId) ids.add(r.poll.sourceMessageId)
  }
  return [...ids]
}

// ── Reading the chat ────────────────────────────────────────────────────

export async function unreadCountFor(
  tripId: string,
  userId: string,
  known?: { chatReadAt: Date | null; joinedAt: Date }
): Promise<number> {
  const member = known ?? (await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } }))
  if (!member) return 0
  const since = member.chatReadAt ?? member.joinedAt
  return prisma.chatMessage.count({
    where: {
      tripId,
      createdAt: { gt: since },
      kind: { not: "SYSTEM" },
      NOT: { authorId: userId },
    },
  })
}

/** Poll deadlines pass without anyone clicking: post the result the first time anyone looks. */
export async function announceClosedPolls(tripId: string) {
  const due = await prisma.poll.findMany({
    where: { tripId, announcedAt: null, closesAt: { lte: new Date() } },
    include: { votes: { select: { option: true } }, chatMessage: { select: { id: true } } },
  })
  for (const poll of due) {
    const claimed = await prisma.poll.updateMany({ where: { id: poll.id, announcedAt: null }, data: { announcedAt: new Date() } })
    if (claimed.count === 0) continue // someone else just did it
    await postPollResult(tripId, poll)
  }
}

export async function postPollResult(
  tripId: string,
  poll: { id: string; question: string; options: unknown; votes: { option: string }[] }
) {
  const options = (poll.options as string[]) ?? []
  const counts = options.map((o) => poll.votes.filter((v) => v.option === o).length)
  const top = Math.max(0, ...counts)
  const winners = top > 0 ? options.filter((_, i) => counts[i] === top) : []
  const text =
    winners.length === 0
      ? `Poll closed with no votes: ${poll.question}`
      : winners.length === 1
        ? `Poll closed: ${winners[0]} won "${poll.question}" with ${top} ${top === 1 ? "vote" : "votes"}.`
        : `Poll closed in a tie between ${winners.join(" and ")}: ${poll.question}`
  await postSystem(tripId, text, { event: "poll_closed" })
  const voters = await prisma.tripMember.findMany({ where: { tripId, role: { not: "OBSERVER" } }, select: { userId: true } })
  await notify({
    tripId,
    to: { users: await awayFrom(tripId, voters.map((v) => v.userId)) },
    type: "poll_closed",
    title: winners.length === 1 ? `Decided: ${winners[0]}` : "A poll just closed",
    body: poll.question,
    url: tripUrl(tripId, "chat"),
  })
}

const lastSweep = new Map<string, number>()

/** The housekeeping every poll doesn't need: result posts for deadlines, and answers that never finished. */
async function sweep(tripId: string) {
  const last = lastSweep.get(tripId) ?? 0
  if (Date.now() - last < 10_000) return
  lastSweep.set(tripId, Date.now())
  await Promise.all([
    announceClosedPolls(tripId),
    // A Trippo answer that never finished (the server restarted mid-search) shouldn't spin forever.
    prisma.chatMessage.updateMany({
      where: { tripId, kind: "AI", status: "thinking", createdAt: { lt: new Date(Date.now() - THINKING_TIMEOUT_MS) } },
      data: { status: "failed", body: "That took too long. Ask me again." },
    }),
  ])
}

export async function loadSnapshot(
  tripId: string,
  viewerId: string,
  opts: { since?: string; before?: string; limit?: number },
  member?: { chatReadAt: Date | null; joinedAt: Date }
): Promise<ChatSnapshot> {
  const now = new Date()
  await sweep(tripId)

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100)
  let rows: MessageRow[]
  let hasMore = false

  if (opts.since) {
    const since = new Date(opts.since)
    rows = await prisma.chatMessage.findMany({
      where: { tripId, updatedAt: { gt: Number.isNaN(since.getTime()) ? new Date(0) : since } },
      include: messageInclude,
      orderBy: { createdAt: "asc" },
      take: 200,
    })
  } else {
    const older = opts.before ? new Date(opts.before) : null
    const found = await prisma.chatMessage.findMany({
      where: { tripId, ...(older && !Number.isNaN(older.getTime()) ? { createdAt: { lt: older } } : {}) },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    })
    hasMore = found.length > limit
    rows = found.slice(0, limit).reverse()
  }

  const [states, unread] = await Promise.all([
    itemStatesFor(stateSourceIds(rows)),
    unreadCountFor(tripId, viewerId, member),
  ])
  return {
    messages: rows.map((r) => toDTO(r, viewerId, states)),
    hasMore,
    now: now.toISOString(),
    unread,
  }
}

export async function loadMessage(messageId: string, viewerId: string): Promise<ChatMessageDTO | null> {
  const row = await prisma.chatMessage.findUnique({ where: { id: messageId }, include: messageInclude })
  if (!row) return null
  const states = await itemStatesFor(stateSourceIds([row]))
  return toDTO(row, viewerId, states)
}

// ── Posting ─────────────────────────────────────────────────────────────

export async function postSystem(tripId: string, body: string, payload: NoticePayload) {
  return prisma.chatMessage.create({
    data: { tripId, kind: "SYSTEM", body: body.slice(0, 400), payload: payload as unknown as Prisma.InputJsonValue },
  })
}

/** People who aren't looking at the chat right now: the only ones worth a notification. */
export async function awayFrom(tripId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []
  const present = await prisma.tripMember.findMany({
    where: { tripId, userId: { in: userIds }, chatSeenAt: { gt: new Date(Date.now() - AWAY_AFTER_MS) } },
    select: { userId: true },
  })
  const here = new Set(present.map((p) => p.userId))
  return userIds.filter((id) => !here.has(id))
}

/** Records that this person has the chat open (throttled, since the client polls every few seconds). */
export async function touchPresence(
  tripId: string,
  userId: string,
  read: boolean,
  known?: { chatSeenAt: Date | null }
) {
  const now = new Date()
  if (!read && known?.chatSeenAt && now.getTime() - known.chatSeenAt.getTime() < 8_000) return
  await prisma.tripMember.updateMany({
    where: {
      tripId,
      userId,
      ...(read ? {} : { OR: [{ chatSeenAt: null }, { chatSeenAt: { lt: new Date(now.getTime() - 8_000) } }] }),
    },
    data: read ? { chatSeenAt: now, chatReadAt: now } : { chatSeenAt: now },
  })
}

// ── Trippo ──────────────────────────────────────────────────────────────

/** The places the crew will actually visit, in order: what videos are matched against. */
async function itineraryStops(tripId: string): Promise<string[]> {
  const items = await prisma.itineraryItem.findMany({
    where: { day: { itinerary: { tripId } }, category: { in: ["ACTIVITY", "FOOD"] } },
    orderBy: [{ day: { dayNumber: "asc" } }, { order: "asc" }],
    select: { title: true, placeName: true },
    take: 60,
  })
  return [...new Set(items.map((i) => (i.placeName || i.title).trim()).filter(Boolean))]
}

async function itineraryDigest(tripId: string): Promise<string> {
  const plan = await prisma.itinerary.findFirst({
    where: { tripId },
    orderBy: { generatedAt: "desc" },
    include: { days: { orderBy: { dayNumber: "asc" }, include: { items: { orderBy: { order: "asc" } } } } },
  })
  if (!plan) return ""
  const numbers = numberStops(plan.days.map((d) => ({ items: d.items })))
  const lines = plan.days.map((d) => {
    const when = d.date ? ` (${format(d.date, "EEE d MMM")})` : ""
    const stops = d.items
      .slice(0, 12)
      .map((i) => {
        const n = numbers.get(i.id)
        return `${n ? `#${n} ` : ""}${i.startTime ? `${i.startTime} ` : ""}${i.title}`.slice(0, 70)
      })
      .join("; ")
    return `Day ${d.dayNumber}${when}: ${stops}`
  })
  return lines.join("\n").slice(0, 1800)
}

/** Runs one @trippo question to the end, writing progress into the message as it goes. */
export async function runTrippoForMessage(aiMessageId: string) {
  const message = await prisma.chatMessage.findUnique({ where: { id: aiMessageId } })
  if (!message || message.kind !== "AI") return
  const payload = message.payload as unknown as AiPayload
  const tripId = message.tripId

  const finish = async (data: Prisma.ChatMessageUpdateInput) => prisma.chatMessage.update({ where: { id: aiMessageId }, data })

  try {
    const [trip, members, asker, stay, recent, digest, stops] = await Promise.all([
      prisma.trip.findUnique({ where: { id: tripId } }),
      prisma.tripMember.findMany({ where: { tripId }, include: { preference: true } }),
      prisma.user.findUnique({ where: { id: payload.askedById }, select: { name: true, email: true } }),
      prisma.stayOption.findFirst({ where: { tripId, selected: true }, select: { name: true } }),
      prisma.chatMessage.findMany({
        where: { tripId, createdAt: { lt: message.createdAt }, kind: { in: ["TEXT", "AI"] } },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { author: { select: { name: true, email: true } } },
      }),
      itineraryDigest(tripId),
      itineraryStops(tripId),
    ])
    if (!trip) return

    const tally = (values: string[]) => {
      const counts = new Map<string, number>()
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)
    }
    const prefs = members.map((m) => m.preference).filter((p): p is NonNullable<typeof p> => p !== null)
    const day = (d: Date) => d.toISOString().slice(0, 10)

    let lastWrite = 0
    const answer = await runTrippo(
      {
        tripId,
        tripName: trip.name,
        destination: trip.destination,
        originCity: trip.originCity,
        startDate: day(trip.startDate),
        endDate: day(trip.endDate),
        currency: trip.currency,
        crewSize: members.filter((m) => m.status === "ACTIVE").length || 1,
        pace: tally(prefs.map((p) => p.pace).filter((v): v is NonNullable<typeof v> => v != null))[0],
        interests: tally(prefs.flatMap((p) => p.interests)).slice(0, 5),
        budgetPerPerson: trip.budgetPerPerson,
        itineraryDigest: digest,
        stops,
        chosenStay: stay?.name ?? null,
        recent: recent
          .reverse()
          .map((m) => ({ author: m.kind === "AI" ? "Trippo" : m.author ? displayName(m.author) : "Someone", text: snippet(m.body, 300) }))
          .filter((m) => m.text),
        asker: asker ? displayName(asker) : "A crew member",
        question: payload.question,
      },
      async (steps) => {
        const now = Date.now()
        if (now - lastWrite < 250 && steps.every((s) => s.done)) return
        lastWrite = now
        await finish({ payload: { ...payload, steps } as unknown as Prisma.InputJsonValue })
      }
    )

    await finish({
      status: "ready",
      body: answer.message,
      payload: {
        ...payload,
        steps: [],
        cards: answer.cards,
        followUps: answer.followUps,
      } as unknown as Prisma.InputJsonValue,
    })

    const [asked] = await awayFrom(tripId, [payload.askedById])
    if (asked) {
      await notify({
        tripId,
        to: { users: [asked] },
        push: false,
        type: "trippo_answer",
        title: "Trippo answered your question",
        body: snippet(answer.message, 120),
        url: tripUrl(tripId, "chat"),
      })
    }
  } catch (error) {
    console.error("Trippo failed:", error)
    await finish({
      status: "failed",
      body: "I hit a problem looking that up. Try asking again.",
      payload: { ...payload, steps: [], error: "failed" } as unknown as Prisma.InputJsonValue,
    }).catch(() => {})
  }
}
