"use server"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import type { NotificationData } from "@/lib/notifications"

export async function listNotifications(
  limit = 20,
  unreadOnly = false
): Promise<NotificationData[]> {
  const user = await requireUser()
  const rows = await prisma.notification.findMany({
    where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
    include: { trip: { select: { name: true } } },
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
    tripName: n.trip?.name ?? null,
  }))
}

export async function getUnreadCount(): Promise<number> {
  const user = await requireUser()
  return prisma.notification.count({ where: { userId: user.id, readAt: null } })
}

export async function markNotificationRead(id: string) {
  const user = await requireUser()
  await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  })
  return { ok: true as const }
}

export async function markAllNotificationsRead() {
  const user = await requireUser()
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  })
  return { ok: true as const }
}
