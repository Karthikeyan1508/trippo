"use server"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { pushEnabled, sendPush } from "@/lib/push"

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

export type PushStatus = {
  /** The server has VAPID keys, so push can work at all. */
  available: boolean
  /** How many of this user's devices are subscribed. */
  devices: number
}

export async function getPushStatus(): Promise<PushStatus> {
  const user = await requireUser()
  const devices = await prisma.pushSubscription.count({ where: { userId: user.id } })
  return { available: pushEnabled(), devices }
}

/** Register (or re-assign) this browser for push. Called after the user opts in. */
export async function savePushSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
): Promise<Result> {
  const user = await requireUser()
  const { endpoint, keys } = subscription ?? {}
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    endpoint.length > 2000 ||
    typeof keys?.p256dh !== "string" ||
    typeof keys?.auth !== "string"
  ) {
    return { ok: false, error: "That device couldn't be registered for notifications." }
  }

  // The same browser signing in as someone else takes the subscription over.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent?.slice(0, 200) ?? null,
    },
    update: {
      userId: user.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent?.slice(0, 200) ?? null,
    },
  })
  return { ok: true }
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  const user = await requireUser()
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } })
  return { ok: true }
}

export type TestResult = {
  /** Devices this account has registered. */
  devices: number
  /** Devices the push service accepted the message for. */
  sent: number
  /** Devices that were dead and got removed, so the user must turn push on again. */
  removed: number
  failed: number
  status?: number
}

/**
 * A push to yourself, so you can confirm it reaches this device. It goes
 * straight to the push service (no 2-minute de-duplication, no inbox row) and
 * reports what actually happened.
 */
export async function sendTestNotification(): Promise<Result<TestResult>> {
  const user = await requireUser()
  if (!pushEnabled()) {
    return { ok: false, error: "Push isn't configured on the server yet." }
  }
  const devices = await prisma.pushSubscription.count({ where: { userId: user.id } })
  const res = await sendPush([user.id], {
    title: "Trippo notifications are working",
    body: "You'll hear about plan votes, new polls, gear picks and expenses.",
    url: "/notifications",
    tag: `test:${Date.now()}`,
  })
  return {
    ok: true,
    data: { devices, sent: res.sent, removed: res.removed, failed: res.failed, status: res.lastStatus },
  }
}
