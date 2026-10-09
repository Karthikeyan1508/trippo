import webpush from "web-push"

import { prisma } from "@/lib/prisma"

export type PushPayload = {
  title: string
  body?: string
  url: string
  /** Same tag = the newer notification replaces the older one on the device. */
  tag?: string
}

let configured: boolean | null = null

/** Web Push needs a VAPID key pair; without one, push quietly stays off. */
export function pushEnabled() {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) {
    configured = false
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

/**
 * Sends a push to every device the given users have subscribed. Dead
 * subscriptions (the browser reports 404/410) are removed as we find them.
 */
export async function sendPush(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0 || !pushEnabled()) return { sent: 0, removed: 0 }

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  })
  const body = JSON.stringify(payload)
  let sent = 0
  const dead: string[] = []

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24 }
        )
        sent++
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(s.id)
        else console.error("Push failed:", status ?? error)
      }
    })
  )

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } })
  }
  return { sent, removed: dead.length }
}
