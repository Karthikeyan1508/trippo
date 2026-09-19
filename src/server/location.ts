"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"

type CheckpointTypeT = "POINT" | "STAY" | "FOOD" | "MEETING" | "DANGER"

type ActionResult = { ok: true } | { ok: false; error: string }

export type LiveMember = {
  userId: string
  name: string | null
  image: string | null
  lat: number
  lng: number
  updatedAt: string
  isMe: boolean
}

export type LiveCheckpoint = {
  id: string
  name: string
  lat: number
  lng: number
  type: string
}

export type LiveData =
  | { ok: true; members: LiveMember[]; checkpoints: LiveCheckpoint[] }
  | { ok: false; error: string }

async function membership(tripId: string, userId: string) {
  return prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
  })
}

/** Upsert the current member's live location. Called on a short interval while sharing. */
export async function updateMyLocation(
  tripId: string,
  lat: number,
  lng: number,
  accuracy?: number
): Promise<ActionResult> {
  const user = await requireUser()
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Invalid coordinates." }
  }
  const member = await membership(tripId, user.id)
  if (!member) return { ok: false, error: "You're not a member of this trip." }

  await prisma.memberLocation.upsert({
    where: { tripId_userId: { tripId, userId: user.id } },
    create: { tripId, userId: user.id, lat, lng, accuracy: accuracy ?? null },
    update: { lat, lng, accuracy: accuracy ?? null },
  })
  return { ok: true }
}

/** Stop sharing: remove the current member's live location. */
export async function stopSharingLocation(tripId: string): Promise<ActionResult> {
  const user = await requireUser()
  await prisma.memberLocation.deleteMany({
    where: { tripId, userId: user.id },
  })
  return { ok: true }
}

/** Poll target: all members' live locations + checkpoints for a trip. */
export async function getLiveData(tripId: string): Promise<LiveData> {
  const user = await requireUser()
  const member = await membership(tripId, user.id)
  if (!member) return { ok: false, error: "You're not a member of this trip." }

  const [locations, checkpoints] = await Promise.all([
    prisma.memberLocation.findMany({
      where: { tripId },
      include: { user: true },
    }),
    prisma.checkpoint.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
    }),
  ])

  return {
    ok: true,
    members: locations.map((l) => ({
      userId: l.userId,
      name: l.user.name,
      image: l.user.image,
      lat: l.lat,
      lng: l.lng,
      updatedAt: l.updatedAt.toISOString(),
      isMe: l.userId === user.id,
    })),
    checkpoints: checkpoints.map((c) => ({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      type: c.type,
    })),
  }
}

export async function addCheckpoint(
  tripId: string,
  name: string,
  lat: number,
  lng: number,
  type: CheckpointTypeT = "POINT"
): Promise<ActionResult> {
  const user = await requireUser()
  const member = await membership(tripId, user.id)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  if (member.role === "OBSERVER") {
    return { ok: false, error: "Observers can't add pins." }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Invalid coordinates." }
  }

  await prisma.checkpoint.create({
    data: {
      tripId,
      name: name.trim().slice(0, 80) || "Pin",
      lat,
      lng,
      type,
      createdById: user.id,
    },
  })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true }
}

export async function removeCheckpoint(id: string): Promise<ActionResult> {
  const user = await requireUser()
  const cp = await prisma.checkpoint.findUnique({ where: { id } })
  if (!cp) return { ok: false, error: "Pin not found." }
  const member = await membership(cp.tripId, user.id)
  if (!member || member.role === "OBSERVER") {
    return { ok: false, error: "Not allowed." }
  }
  await prisma.checkpoint.delete({ where: { id } })
  revalidatePath(`/trips/${cp.tripId}`)
  return { ok: true }
}
