import { after } from "next/server"

import { prisma } from "@/lib/prisma"
import { sendPush } from "@/lib/push"
import type { NotificationType } from "@/lib/notifications"

/** Who should hear about it, relative to the person who did the thing. */
export type Audience =
  | "others" // everyone on the trip except the actor
  | "voters" // everyone who can vote (not observers), except the actor
  | "admins" // trip admins, except the actor
  | { users: string[] }

export type NotifyInput = {
  tripId?: string
  /** Whoever triggered it, never notified about their own action. */
  actorId?: string
  to: Audience
  type: NotificationType
  title: string
  body?: string
  /** Relative path the notification opens, e.g. /trips/<id>?tab=chat */
  url: string
}

/** First name, or the email's local part, for use inside a sentence. */
export function personName(user: { name?: string | null; email?: string | null }) {
  return user.name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "Someone"
}

async function resolveRecipients(input: NotifyInput): Promise<string[]> {
  let ids: string[]
  if (typeof input.to === "object") {
    ids = input.to.users
  } else {
    if (!input.tripId) return []
    const members = await prisma.tripMember.findMany({
      where: {
        tripId: input.tripId,
        ...(input.to === "admins" ? { role: "ADMIN" } : {}),
        ...(input.to === "voters" ? { role: { not: "OBSERVER" } } : {}),
      },
      select: { userId: true },
    })
    ids = members.map((m) => m.userId)
  }
  return [...new Set(ids)].filter((id) => id !== input.actorId)
}

/**
 * Records an in-app notification for each recipient and, once the response has
 * been sent, pushes it to their subscribed devices. Failures are logged and
 * swallowed: a notification problem must never break the action behind it.
 */
export async function notify(input: NotifyInput) {
  try {
    const recipients = await resolveRecipients(input)
    if (recipients.length === 0) return

    // Don't repeat the same message if it was just sent (e.g. a vote flipped twice).
    const recent = await prisma.notification.findMany({
      where: {
        userId: { in: recipients },
        type: input.type,
        title: input.title,
        url: input.url,
        createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) },
      },
      select: { userId: true },
    })
    const already = new Set(recent.map((r) => r.userId))
    const fresh = recipients.filter((id) => !already.has(id))
    if (fresh.length === 0) return

    await prisma.notification.createMany({
      data: fresh.map((userId) => ({
        userId,
        tripId: input.tripId ?? null,
        type: input.type,
        title: input.title.slice(0, 140),
        body: input.body?.slice(0, 240) ?? null,
        url: input.url,
      })),
    })

    // On a device the trip name matters: the same crew action can happen on any of their trips.
    const trip = input.tripId
      ? await prisma.trip.findUnique({ where: { id: input.tripId }, select: { name: true } })
      : null
    const pushBody = [trip?.name, input.body].filter(Boolean).join(" · ") || undefined

    const push = () =>
      sendPush(fresh, {
        title: input.title,
        body: pushBody,
        url: input.url,
        tag: `${input.type}:${input.url}`,
      }).catch((error) => console.error("Push delivery failed:", error))

    try {
      after(push) // keep the user's request fast
    } catch {
      void push() // not inside a request (scripts/tests)
    }
  } catch (error) {
    console.error("notify failed:", error)
  }
}
