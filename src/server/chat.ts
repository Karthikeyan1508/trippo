"use server"

import { after } from "next/server"
import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { membershipFor } from "@/lib/access"
import { rateLimit } from "@/lib/rate-limit"
import { tripUrl } from "@/lib/notifications"
import { notify, personName } from "@/server/notify"
import { addToItinerary, type PlanAddition } from "@/server/plan-changes"
import {
  awayFrom,
  displayName,
  loadMessage,
  loadSnapshot,
  postSystem,
  runTrippoForMessage,
  touchPresence,
  unreadCountFor,
} from "@/server/chat-core"
import {
  addressesTrippo,
  formatMinutes,
  mentionedIds,
  snippet,
  stripTrippo,
  type AiPayload,
  type CardItem,
  type ChatCard,
  type ChatMessageDTO,
  type ChatSnapshot,
  type HotelItem,
  type PlaceItem,
  type TransportItem,
} from "@/lib/chat"

type Fail = { ok: false; error: string }
type Result<T extends object = object> = ({ ok: true } & T) | Fail

const MAX_MESSAGE = 1500

// ── Reading ─────────────────────────────────────────────────────────────

/** The chat for this trip. `since` asks only for what changed; `before` pages back through history. */
export async function getChat(
  tripId: string,
  opts?: { since?: string; before?: string; limit?: number; present?: boolean; read?: boolean }
): Promise<Result<{ snapshot: ChatSnapshot }>> {
  const { user, member } = await membershipFor(tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  const [, snapshot] = await Promise.all([
    opts?.present || opts?.read ? touchPresence(tripId, user.id, Boolean(opts.read), member) : Promise.resolve(),
    loadSnapshot(tripId, user.id, opts ?? {}, member),
  ])
  return { ok: true, snapshot }
}

export async function getChatUnread(tripId: string): Promise<number> {
  const { user, member } = await membershipFor(tripId)
  if (!member) return 0
  return unreadCountFor(tripId, user.id, member)
}

/** Marks the chat as read, along with its notifications (they would only repeat what is on screen). */
export async function markChatRead(tripId: string): Promise<void> {
  const { user, member } = await membershipFor(tripId)
  if (!member) return
  await touchPresence(tripId, user.id, true)
  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      tripId,
      readAt: null,
      type: { in: ["chat_message", "chat_mention", "trippo_answer", "poll_created", "poll_closed", "itinerary_request", "request_decided"] },
    },
    data: { readAt: new Date() },
  })
}

// ── Writing ─────────────────────────────────────────────────────────────

const INTRO_FOLLOW_UPS = (destination: string) => [
  `Top 3 hotels near ${destination}`,
  `Best local food near ${destination}`,
  `How do we get around ${destination}?`,
]

/**
 * Posts a message. Naming @trippo makes Trippo answer: the question is stored at once and
 * the answer is worked out in the background, so sending never waits on a search.
 */
export async function sendChatMessage(
  tripId: string,
  body: string,
  replyToId?: string | null
): Promise<Result<{ messages: ChatMessageDTO[] }>> {
  const { user, member } = await membershipFor(tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." }

  const text = body.trim().slice(0, MAX_MESSAGE)
  if (!text) return { ok: false, error: "Write something first." }
  const limited = rateLimit(`chat:${user.id}`, 30, 60_000)
  if (!limited.ok) return { ok: false, error: `Easy there. Try again in ${limited.retryAfter}s.` }

  const [trip, crew, replyTarget] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId }, select: { name: true, destination: true } }),
    prisma.tripMember.findMany({
      where: { tripId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    replyToId ? prisma.chatMessage.findFirst({ where: { id: replyToId, tripId }, select: { id: true } }) : Promise.resolve(null),
  ])
  if (!trip) return { ok: false, error: "Trip not found." }
  const mentions = mentionedIds(text, crew.map((c) => ({ id: c.userId, name: displayName(c.user) }))).filter((id) => id !== user.id)
  const replyTo = replyTarget?.id ?? null

  const asksTrippo = addressesTrippo(text)
  const created = await prisma.chatMessage.create({
    data: { tripId, authorId: user.id, kind: "TEXT", body: text, mentionIds: mentions, replyToId: replyTo },
  })
  const messages = [created.id]

  if (asksTrippo) {
    const question = stripTrippo(text)
    const perUser = rateLimit(`trippo:${user.id}`, 10, 3_600_000)
    const perTrip = rateLimit(`trippo-trip:${tripId}`, 60, 86_400_000)

    if (!perUser.ok || !perTrip.ok) {
      const reply = await prisma.chatMessage.create({
        data: {
          tripId,
          kind: "AI",
          body: "I've answered a lot of questions just now. Give me a few minutes and ask again.",
          replyToId: created.id,
          payload: { askedById: user.id, question, steps: [], cards: [], followUps: [] } as unknown as Prisma.InputJsonValue,
        },
      })
      messages.push(reply.id)
    } else if (question.length < 2) {
      const reply = await prisma.chatMessage.create({
        data: {
          tripId,
          kind: "AI",
          body: "Hi, I'm Trippo. Ask me for hotels, ways to get from one stop to another, or things to do, and I'll look it up. Try one of these:",
          replyToId: created.id,
          payload: { askedById: user.id, question: "", steps: [], cards: [], followUps: INTRO_FOLLOW_UPS(trip.destination) } as unknown as Prisma.InputJsonValue,
        },
      })
      messages.push(reply.id)
    } else {
      const payload: AiPayload = { askedById: user.id, question, steps: [{ label: "Reading your question", done: true }], cards: [], followUps: [] }
      const reply = await prisma.chatMessage.create({
        data: { tripId, kind: "AI", status: "thinking", body: "", replyToId: created.id, payload: payload as unknown as Prisma.InputJsonValue },
      })
      messages.push(reply.id)
      after(() => runTrippoForMessage(reply.id))
    }
  }

  // Tell the people who aren't looking at the chat. Anyone who is will see it land.
  const recently = Date.now() - 25_000
  const away = crew
    .filter((c) => c.userId !== user.id && !(c.chatSeenAt && c.chatSeenAt.getTime() > recently))
    .map((c) => c.userId)
  const mentionedAway = mentions.filter((id) => away.includes(id))
  if (mentionedAway.length > 0) {
    await notify({
      tripId,
      actorId: user.id,
      to: { users: mentionedAway },
      type: "chat_mention",
      title: `${personName(user)} mentioned you`,
      body: snippet(text, 120),
      url: tripUrl(tripId, "chat"),
    })
  }
  const rest = away.filter((id) => !mentionedAway.includes(id))
  if (rest.length > 0 && !asksTrippo) {
    await notify({
      tripId,
      actorId: user.id,
      to: { users: rest },
      type: "chat_message",
      title: `${personName(user)} in ${trip.name}`,
      body: snippet(text, 120),
      url: tripUrl(tripId, "chat"),
    })
  }

  const [, loaded] = await Promise.all([
    touchPresence(tripId, user.id, true),
    Promise.all(messages.map((id) => loadMessage(id, user.id))),
  ])
  return { ok: true, messages: loaded.filter((m): m is ChatMessageDTO => m !== null) }
}

/** Asks Trippo again after a failed or timed-out answer. */
export async function retryTrippo(tripId: string, messageId: string): Promise<Result> {
  const { user, member } = await membershipFor(tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, tripId, kind: "AI" } })
  if (!message) return { ok: false, error: "That message is gone." }
  const payload = message.payload as unknown as AiPayload
  if (payload.askedById !== user.id && member.role !== "ADMIN") {
    return { ok: false, error: "Only the person who asked, or an admin, can do that." }
  }
  if (message.status === "thinking") return { ok: true }
  const limited = rateLimit(`trippo:${user.id}`, 10, 3_600_000)
  if (!limited.ok) return { ok: false, error: "Give it a few minutes, then try again." }

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { status: "thinking", body: "", payload: { ...payload, steps: [{ label: "Reading your question", done: true }], cards: [], followUps: [], error: undefined } as unknown as Prisma.InputJsonValue },
  })
  after(() => runTrippoForMessage(messageId))
  return { ok: true }
}

export async function deleteChatMessage(tripId: string, messageId: string): Promise<Result> {
  const { user, member } = await membershipFor(tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  const message = await prisma.chatMessage.findFirst({ where: { id: messageId, tripId } })
  if (!message || message.kind !== "TEXT") return { ok: false, error: "That message can't be deleted." }
  if (message.authorId !== user.id && member.role !== "ADMIN") {
    return { ok: false, error: "You can only delete your own messages." }
  }
  await prisma.chatMessage.delete({ where: { id: messageId } })
  return { ok: true }
}

// ── Cards: polls and itinerary additions ────────────────────────────────

type Located =
  | { kind: "hotel"; card: ChatCard; item: HotelItem }
  | { kind: "transport"; card: ChatCard; item: TransportItem }
  | { kind: "place"; card: ChatCard; item: PlaceItem }

function locate(message: { payload: unknown }, cardId: string, itemKey: string): Located | null {
  const payload = message.payload as AiPayload | null
  const card = payload?.cards?.find((c) => c.id === cardId)
  const item = (card?.items as CardItem[] | undefined)?.find((i) => i.key === itemKey)
  if (!card || !item) return null
  if (card.type === "hotels") return { kind: "hotel", card, item: item as HotelItem }
  if (card.type === "transport") return { kind: "transport", card, item: item as TransportItem }
  return { kind: "place", card, item: item as PlaceItem }
}

const cardLabel = (c: Located): string => ("name" in c.item ? c.item.name : c.item.title)

/** What we keep of a suggestion once it leaves the chat card: enough to add it to the plan later. */
function snapshotOf(found: Located) {
  const card =
    found.card.type === "transport"
      ? { type: found.card.type, title: found.card.title, from: found.card.from, to: found.card.to }
      : { type: found.card.type, title: found.card.title }
  return { kind: found.kind, card, item: found.item }
}

function additionOf(snap: ReturnType<typeof snapshotOf>): PlanAddition {
  if (snap.kind === "hotel") return { kind: "hotel", item: snap.item as HotelItem }
  if (snap.kind === "transport") {
    const card = snap.card as { from?: string; to?: string }
    return { kind: "transport", item: snap.item as TransportItem, from: card.from, to: card.to }
  }
  return { kind: "place", item: snap.item as PlaceItem }
}

/** Puts the AI's options to the crew as a poll, right in the chat. */
export async function startCardPoll(input: {
  tripId: string
  messageId: string
  cardId: string
  itemKeys: string[]
  question?: string
  closesInMinutes?: number | null
}): Promise<Result<{ message: ChatMessageDTO }>> {
  const { user, member } = await membershipFor(input.tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  if (member.role === "OBSERVER") return { ok: false, error: "Observers can follow polls but not start them." }

  const source = await prisma.chatMessage.findFirst({ where: { id: input.messageId, tripId: input.tripId, kind: "AI" } })
  if (!source) return { ok: false, error: "That answer is gone." }

  const keys = [...new Set(input.itemKeys)].slice(0, 8)
  const found = keys.map((k) => locate(source, input.cardId, k)).filter((f): f is Located => f !== null)
  if (found.length < 2) return { ok: false, error: "Pick at least two options for the poll." }

  const open = await prisma.poll.findFirst({
    where: { tripId: input.tripId, sourceMessageId: input.messageId, sourceCardId: input.cardId, OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] },
  })
  if (open) return { ok: false, error: "A poll for these options is already open. Vote in it, or close it first." }

  // Labels must be unique and short: they are what people tap.
  const labels: string[] = []
  const labelOf = (f: Located): string => {
    const raw =
      f.kind === "transport"
        ? `${(f.item as TransportItem).title}${(f.item as TransportItem).durationMin ? ` (${formatMinutes((f.item as TransportItem).durationMin)})` : ""}`
        : cardLabel(f)
    let label = raw.slice(0, 80)
    let n = 2
    while (labels.includes(label)) label = `${raw.slice(0, 74)} (${n++})`
    labels.push(label)
    return label
  }

  const first = found[0]
  const card = first.card
  const defaultQuestion =
    card.type === "hotels"
      ? `Where should we stay${card.area ? ` near ${card.area}` : ""}?`
      : card.type === "transport"
        ? `How should we get from ${card.from} to ${card.to}?`
        : `Which should we do${card.type === "places" && card.area ? ` near ${card.area}` : ""}?`
  const question = (input.question?.trim() || defaultQuestion).slice(0, 160)

  const items: Record<string, unknown> = {}
  for (const f of found) {
    const label = labelOf(f)
    const it = f.item as HotelItem & TransportItem & PlaceItem
    items[label] = {
      itemKey: f.item.key,
      kind: f.kind,
      title: cardLabel(f),
      subtitle:
        f.kind === "hotel"
          ? [it.priceNight ? `${it.priceNight} per night` : null, it.rating ? `${it.rating} rating` : null].filter(Boolean).join(", ")
          : f.kind === "transport"
            ? [it.operator ?? null, it.cost ?? null].filter(Boolean).join(", ")
            : [it.category, it.rating ? `${it.rating} rating` : null].filter(Boolean).join(", "),
      image: f.kind === "transport" ? undefined : it.image,
      link: it.link,
      rating: f.kind === "transport" ? undefined : it.rating,
      item: snapshotOf(f),
    }
  }

  const minutes = input.closesInMinutes && input.closesInMinutes > 0 ? Math.min(input.closesInMinutes, 60 * 24 * 14) : null
  const poll = await prisma.poll.create({
    data: {
      tripId: input.tripId,
      question,
      options: labels,
      createdById: user.id,
      closesAt: minutes ? new Date(Date.now() + minutes * 60_000) : null,
      meta: { items } as unknown as Prisma.InputJsonValue,
      sourceMessageId: input.messageId,
      sourceCardId: input.cardId,
      chatMessage: { create: { tripId: input.tripId, authorId: user.id, kind: "POLL", body: question } },
    },
    include: { chatMessage: { select: { id: true } } },
  })

  const voters = await prisma.tripMember.findMany({
    where: { tripId: input.tripId, role: { not: "OBSERVER" }, NOT: { userId: user.id } },
    select: { userId: true },
  })
  await notify({
    tripId: input.tripId,
    actorId: user.id,
    to: { users: await awayFrom(input.tripId, voters.map((v) => v.userId)) },
    type: "poll_created",
    title: `${personName(user)} started a poll`,
    body: question,
    url: tripUrl(input.tripId, "chat"),
  })
  // Wake the AI message so its card shows "In a poll" on the next refresh.
  await prisma.chatMessage.update({ where: { id: input.messageId }, data: { updatedAt: new Date() } })

  const message = poll.chatMessage ? await loadMessage(poll.chatMessage.id, user.id) : null
  if (!message) return { ok: false, error: "The poll was created but could not be loaded." }
  return { ok: true, message }
}

/** Tells everyone else (who isn't looking at the chat) what changed in the plan. */
async function announceChange(
  tripId: string,
  actor: { id: string; name?: string | null; email?: string | null },
  type: "trip_updated" | "stay_chosen",
  title: string,
  body: string
) {
  const crew = await prisma.tripMember.findMany({ where: { tripId, status: "ACTIVE", NOT: { userId: actor.id } }, select: { userId: true } })
  const away = await awayFrom(tripId, crew.map((c) => c.userId))
  if (away.length === 0) return
  await notify({ tripId, actorId: actor.id, to: { users: away }, type, title, body, url: tripUrl(tripId, "chat") })
}

type AddInput = {
  tripId: string
  dayNumber?: number | null
  startTime?: string | null
  note?: string | null
}

/**
 * The one place a suggestion becomes part of the plan. An admin's choice is applied at once
 * (and noted in the chat); anyone else's becomes a request an admin can approve or decline.
 */
async function submitAddition(
  user: { id: string; name?: string | null; email?: string | null },
  role: string,
  snap: ReturnType<typeof snapshotOf>,
  source: { messageId: string | null; itemKey: string | null },
  input: AddInput
): Promise<Result<{ mode: "added" | "requested" | "stay_saved"; dayNumber?: number; votesReset?: boolean }>> {
  if (role === "OBSERVER") return { ok: false, error: "Observers can follow the plan but not change it." }

  if (source.messageId && source.itemKey) {
    const existing = await prisma.itineraryRequest.findFirst({
      where: { messageId: source.messageId, itemKey: source.itemKey, status: { in: ["PENDING", "APPROVED"] } },
    })
    if (existing) {
      return { ok: false, error: existing.status === "PENDING" ? "That is already waiting for an admin." : "That is already in the plan." }
    }
  }

  const name = String((snap.item as { name?: string; title?: string }).name ?? (snap.item as { title?: string }).title ?? "that")
  const common = {
    tripId: input.tripId,
    requestedById: user.id,
    kind: snap.kind,
    messageId: source.messageId,
    itemKey: source.itemKey,
    item: snap as unknown as Prisma.InputJsonValue,
    dayNumber: input.dayNumber ?? null,
    startTime: input.startTime ?? null,
    note: input.note?.trim().slice(0, 200) || null,
  }

  if (role === "ADMIN") {
    const applied = await addToItinerary(input.tripId, user, additionOf(snap), input)
    if (!applied.ok) return applied
    await prisma.itineraryRequest.create({
      data: { ...common, status: "APPROVED", decidedById: user.id, decidedAt: new Date(), dayNumber: applied.mode === "added" ? applied.dayNumber : common.dayNumber },
    })
    await postSystem(
      input.tripId,
      applied.mode === "added"
        ? `${displayName({ name: user.name ?? null, email: user.email ?? null })} added ${name} to Day ${applied.dayNumber}.${applied.votesReset ? " Votes on the plan were reset." : ""}`
        : `${displayName({ name: user.name ?? null, email: user.email ?? null })} chose ${name} as the group's stay. The plan will be built around it.`,
      { event: applied.mode === "added" ? "added" : "stay_saved", dayNumber: applied.mode === "added" ? applied.dayNumber : undefined, itemName: name }
    )
    if (source.messageId) await prisma.chatMessage.update({ where: { id: source.messageId }, data: { updatedAt: new Date() } })
    await announceChange(
      input.tripId,
      user,
      applied.mode === "added" ? "trip_updated" : "stay_chosen",
      applied.mode === "added" ? `${personName(user)} added ${name} to Day ${applied.dayNumber}` : "The group stay is chosen",
      applied.mode === "added" ? "See the plan" : name
    )
    return applied.mode === "added"
      ? { ok: true, mode: "added", dayNumber: applied.dayNumber, votesReset: applied.votesReset }
      : { ok: true, mode: "stay_saved" }
  }

  // Not an admin: ask. The request shows up in the chat for the admins to act on.
  await prisma.itineraryRequest.create({
    data: { ...common, chatMessage: { create: { tripId: input.tripId, authorId: user.id, kind: "REQUEST", body: `Wants to add ${name}` } } },
  })
  const admins = await prisma.tripMember.findMany({ where: { tripId: input.tripId, role: "ADMIN", NOT: { userId: user.id } }, select: { userId: true } })
  await notify({
    tripId: input.tripId,
    actorId: user.id,
    to: { users: await awayFrom(input.tripId, admins.map((a) => a.userId)) },
    type: "itinerary_request",
    title: `${personName(user)} wants to add ${name}`,
    body: "Approve or decline in the crew chat",
    url: tripUrl(input.tripId, "chat"),
  })
  if (source.messageId) await prisma.chatMessage.update({ where: { id: source.messageId }, data: { updatedAt: new Date() } })
  return { ok: true, mode: "requested" }
}

/** "Add to itinerary" on an AI card item. */
export async function addCardToPlan(
  input: AddInput & { messageId: string; cardId: string; itemKey: string }
): Promise<Result<{ mode: "added" | "requested" | "stay_saved"; dayNumber?: number; votesReset?: boolean }>> {
  const { user, member } = await membershipFor(input.tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  const source = await prisma.chatMessage.findFirst({ where: { id: input.messageId, tripId: input.tripId, kind: "AI" } })
  if (!source) return { ok: false, error: "That answer is gone." }
  const found = locate(source, input.cardId, input.itemKey)
  if (!found) return { ok: false, error: "That option is no longer in the answer." }
  return submitAddition(user, member.role, snapshotOf(found), { messageId: input.messageId, itemKey: input.itemKey }, input)
}

/** "Add winner to itinerary" on a closed poll. */
export async function addPollWinnerToPlan(
  input: AddInput & { pollId: string }
): Promise<Result<{ mode: "added" | "requested" | "stay_saved"; dayNumber?: number; votesReset?: boolean }>> {
  const { user, member } = await membershipFor(input.tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  const poll = await prisma.poll.findFirst({ where: { id: input.pollId, tripId: input.tripId }, include: { votes: { select: { option: true } } } })
  if (!poll) return { ok: false, error: "That poll is gone." }
  if (!poll.closesAt || poll.closesAt > new Date()) return { ok: false, error: "Close the poll first." }

  const options = poll.options as unknown as string[]
  const counts = options.map((o) => poll.votes.filter((v) => v.option === o).length)
  const top = Math.max(0, ...counts)
  const winners = options.filter((_, i) => counts[i] === top)
  if (top === 0 || winners.length !== 1) return { ok: false, error: "There is no single winner to add." }

  const entry = (poll.meta as { items?: Record<string, { itemKey?: string; item?: ReturnType<typeof snapshotOf> }> } | null)?.items?.[winners[0]]
  if (!entry?.item) return { ok: false, error: "This poll has no details to add to the plan." }
  return submitAddition(user, member.role, entry.item, { messageId: poll.sourceMessageId, itemKey: entry.itemKey ?? null }, input)
}

/** An admin's answer to a request. Approving applies it to the plan. */
export async function decideRequest(
  requestId: string,
  approve: boolean,
  opts?: { dayNumber?: number | null; startTime?: string | null }
): Promise<Result<{ dayNumber?: number }>> {
  const request = await prisma.itineraryRequest.findUnique({
    where: { id: requestId },
    include: { requestedBy: { select: { id: true, name: true, email: true } } },
  })
  if (!request) return { ok: false, error: "That request is gone." }
  const { user, member } = await membershipFor(request.tripId)
  if (!member || member.role !== "ADMIN") return { ok: false, error: "Only an admin can decide this." }
  if (request.status !== "PENDING") return { ok: false, error: "Someone already decided this." }

  const snap = request.item as unknown as ReturnType<typeof snapshotOf>
  const name = String((snap.item as { name?: string; title?: string }).name ?? (snap.item as { title?: string }).title ?? "that")
  const who = displayName(request.requestedBy)
  const me = displayName({ name: user.name ?? null, email: user.email ?? null })

  let dayNumber = opts?.dayNumber ?? request.dayNumber
  let stayOnly = false
  if (approve) {
    const applied = await addToItinerary(request.tripId, user, additionOf(snap), {
      dayNumber,
      startTime: opts?.startTime ?? request.startTime,
      note: request.note,
    })
    if (!applied.ok) return applied
    if (applied.mode === "added") dayNumber = applied.dayNumber
    else stayOnly = true
  }

  await prisma.itineraryRequest.update({
    where: { id: requestId },
    data: { status: approve ? "APPROVED" : "DECLINED", decidedById: user.id, decidedAt: new Date(), dayNumber: dayNumber ?? null, startTime: opts?.startTime ?? request.startTime },
  })
  await postSystem(
    request.tripId,
    approve
      ? stayOnly
        ? `${me} approved ${who}'s pick: ${name} is the group's stay. The plan will be built around it.`
        : `${me} approved ${who}'s request: ${name} is now in Day ${dayNumber}.`
      : `${me} declined ${who}'s request to add ${name}.`,
    { event: approve ? "approved" : "declined", dayNumber: dayNumber ?? undefined, itemName: name }
  )
  await prisma.chatMessage.updateMany({
    where: { OR: [{ requestId }, ...(request.messageId ? [{ id: request.messageId }] : [])] },
    data: { updatedAt: new Date() },
  })

  const [away] = await awayFrom(request.tripId, [request.requestedById])
  if (away) {
    await notify({
      tripId: request.tripId,
      actorId: user.id,
      to: { users: [away] },
      type: "request_decided",
      title: approve ? `${name} was added to the plan` : `Your request was declined`,
      body: approve ? `Approved by ${me}` : name,
      url: tripUrl(request.tripId, "chat"),
    })
  }
  return { ok: true, dayNumber: dayNumber ?? undefined }
}
