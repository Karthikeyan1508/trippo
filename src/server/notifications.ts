"use server"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import type { NotificationData } from "@/lib/notifications"

/**
 * Notifications always belong to one trip: everything here is scoped by
 * `tripId` and only ever reads the signed-in person's own rows.
 */

export async function listNotifications(
  tripId: string,
  limit = 20,
  unreadOnly = false
): Promise<NotificationData[]> {
  const user = await requireUser()
  const rows = await prisma.notification.findMany({
    where: { userId: user.id, tripId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  })
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url: n.url,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
    tripName: null,
  }))
}

export async function getUnreadCount(tripId: string): Promise<number> {
  const user = await requireUser()
  return prisma.notification.count({ where: { userId: user.id, tripId, readAt: null } })
}

export async function markNotificationRead(id: string) {
  const user = await requireUser()
  await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  })
  return { ok: true as const }
}

export async function markAllNotificationsRead(tripId: string) {
  const user = await requireUser()
  await prisma.notification.updateMany({
    where: { userId: user.id, tripId, readAt: null },
    data: { readAt: new Date() },
  })
  return { ok: true as const }
}
