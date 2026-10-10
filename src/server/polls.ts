"use server"

import { prisma } from "@/lib/prisma"
import { membershipFor } from "@/lib/access"
import { notify, personName } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"
import { postPollResult } from "@/server/chat-core"

type Result = { ok: true } | { ok: false; error: string }

const MAX_OPTIONS = 8

/** Wakes the poll's chat message, so everyone's next refresh shows the new counts. */
function touchMessage(pollId: string) {
  return prisma.chatMessage.updateMany({ where: { pollId }, data: { updatedAt: new Date() } })
}

/**
 * Any voting member can put a question to the group. The poll lives in the crew chat:
 * it is posted there as a message, and everyone else is told about it.
 */
export async function createPoll(
  tripId: string,
  question: string,
  options: string[],
  closesInMinutes?: number | null
): Promise<Result> {
  const { user, member } = await membershipFor(tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  if (member.role === "OBSERVER") {
    return { ok: false, error: "Observers can follow polls but not start them." }
  }

  const cleanQuestion = question.trim().slice(0, 160)
  const cleanOptions = [
    ...new Set(options.map((o) => o.trim().slice(0, 80)).filter(Boolean)),
  ].slice(0, MAX_OPTIONS)
  if (cleanQuestion.length < 3 || cleanOptions.length < 2) {
    return { ok: false, error: "Add a question and at least two different choices." }
  }
  const minutes = closesInMinutes && closesInMinutes > 0 ? Math.min(closesInMinutes, 60 * 24 * 14) : null

  await prisma.poll.create({
    data: {
      tripId,
      question: cleanQuestion,
      options: cleanOptions,
      createdById: user.id,
      closesAt: minutes ? new Date(Date.now() + minutes * 60_000) : null,
      chatMessage: { create: { tripId, authorId: user.id, kind: "POLL", body: cleanQuestion } },
    },
  })

  const voters = await prisma.tripMember.findMany({
    where: { tripId, role: { not: "OBSERVER" }, NOT: { userId: user.id } },
    select: { userId: true },
  })
  await notify({
    tripId,
    actorId: user.id,
    to: { users: voters.map((v) => v.userId) },
    dedupe: false,
    type: "poll_created",
    title: `${personName(user)} started a poll`,
    body: cleanQuestion,
    url: tripUrl(tripId, "chat"),
  })
  return { ok: true }
}

export async function castVote(pollId: string, option: string): Promise<Result> {
  const poll = await prisma.poll.findUnique({ where: { id: pollId } })
  if (!poll) return { ok: false, error: "That poll no longer exists." }
  const { user, member } = await membershipFor(poll.tripId)
  if (!member || member.role === "OBSERVER") {
    return { ok: false, error: "Observers can view polls but can't vote." }
  }
  if (poll.closesAt && poll.closesAt <= new Date()) {
    return { ok: false, error: "This poll is closed." }
  }
  const options = poll.options as unknown as string[]
  if (!options.includes(option)) {
    return { ok: false, error: "Choose one of the available options." }
  }

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId: user.id } },
    create: { pollId, userId: user.id, option },
    update: { option },
  })
  await touchMessage(pollId)
  return { ok: true }
}

/** Resolves the poll if the caller may manage it: its creator or an admin. */
async function managePollContext(pollId: string) {
  const poll = await prisma.poll.findUnique({ where: { id: pollId } })
  if (!poll) return { ok: false, error: "That poll no longer exists." } as const
  const { user, member } = await membershipFor(poll.tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." } as const
  if (member.role !== "ADMIN" && poll.createdById !== user.id) {
    return {
      ok: false,
      error: "Only the poll's creator or the admin can do that.",
    } as const
  }
  return { ok: true, poll } as const
}

export async function setPollClosed(
  pollId: string,
  closed: boolean
): Promise<Result> {
  const ctx = await managePollContext(pollId)
  if (!ctx.ok) return ctx

  if (!closed) {
    await prisma.poll.update({ where: { id: pollId }, data: { closesAt: null, announcedAt: null } })
    await touchMessage(pollId)
    return { ok: true }
  }

  const now = new Date()
  const updated = await prisma.poll.update({
    where: { id: pollId },
    data: { closesAt: now, announcedAt: now },
    include: { votes: { select: { option: true } } },
  })
  // Closing by hand announces the result straight away; a deadline is announced when someone next looks.
  if (!ctx.poll.announcedAt) await postPollResult(ctx.poll.tripId, updated)
  await touchMessage(pollId)
  return { ok: true }
}

export async function deletePoll(pollId: string): Promise<Result> {
  const ctx = await managePollContext(pollId)
  if (!ctx.ok) return ctx
  await prisma.poll.delete({ where: { id: pollId } })
  return { ok: true }
}
