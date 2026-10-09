"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { membershipFor } from "@/lib/access"
import { notify, personName } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"

type Result = { ok: true } | { ok: false; error: string }

const MAX_OPTIONS = 8

/** Any voting member can raise a question for the group. */
export async function createPoll(
  tripId: string,
  question: string,
  options: string[]
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

  await prisma.poll.create({
    data: {
      tripId,
      question: cleanQuestion,
      options: cleanOptions,
      createdById: user.id,
    },
  })
  await notify({
    tripId,
    actorId: user.id,
    to: "voters",
    type: "poll_created",
    title: `${personName(user)} opened a decision`,
    body: cleanQuestion,
    url: tripUrl(tripId, "decisions"),
  })
  revalidatePath(`/trips/${tripId}`)
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
  revalidatePath(`/trips/${poll.tripId}`)
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
  await prisma.poll.update({
    where: { id: pollId },
    data: { closesAt: closed ? new Date() : null },
  })
  revalidatePath(`/trips/${ctx.poll.tripId}`)
  return { ok: true }
}

export async function deletePoll(pollId: string): Promise<Result> {
  const ctx = await managePollContext(pollId)
  if (!ctx.ok) return ctx
  await prisma.poll.delete({ where: { id: pollId } })
  revalidatePath(`/trips/${ctx.poll.tripId}`)
  return { ok: true }
}
