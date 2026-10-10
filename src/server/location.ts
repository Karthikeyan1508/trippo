"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { isValidLatLng } from "@/lib/geo"

type CheckpointTypeT = "POINT" | "STAY" | "FOOD" | "MEETING" | "DANGER"

type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * live: the device reported a moment ago.
 * off:  it stopped (blocked, switched off, app closed); the last known spot is shown, greyed out.
 * none: this person hasn't shared a location yet.
 */
export type LiveStatus = "live" | "off" | "none"

export type LiveMember = {
  userId: string
  name: string | null
  image: string | null
  lat: number | null
  lng: number | null
  updatedAt: string | null
  status: LiveStatus
  /** Why a device went quiet: "denied", "unavailable", or "stale" (just stopped reporting). */
  offReason: string | null
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
  if (!isValidLatLng({ lat, lng })) {
    return { ok: false, error: "Invalid coordinates." }
  }
  const member = await membership(tripId, user.id)
  if (!member) return { ok: false, error: "You're not a member of this trip." }

  await prisma.memberLocation.upsert({
    where: { tripId_userId: { tripId, userId: user.id } },
    create: { tripId, userId: user.id, lat, lng, accuracy: accuracy ?? null },
    update: { lat, lng, accuracy: accuracy ?? null, sharing: true, offReason: null },
  })
  return { ok: true }
}

/**
 * The device says location is blocked or switched off. The last known position
 * stays on the crew's map, greyed out, with the reason.
 */
export async function reportLocationOff(
  tripId: string,
  reason: "denied" | "unavailable"
): Promise<ActionResult> {
  const user = await requireUser()
  const member = await membership(tripId, user.id)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  await prisma.memberLocation.updateMany({
    where: { tripId, userId: user.id },
    data: { sharing: false, offReason: reason },
  })
  return { ok: true }
}

/** A device that reported within this window counts as live. */
const LIVE_WINDOW_MS = 2 * 60 * 1000
/** Last known positions are kept this long after the last update, then deleted. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/** Poll target: every member's live (or last known) location + checkpoints for a trip. */
export async function getLiveData(tripId: string): Promise<LiveData> {
  const user = await requireUser()
  const member = await membership(tripId, user.id)
  if (!member) return { ok: false, error: "You're not a member of this trip." }

  // Privacy: a last known position isn't kept forever.
  await prisma.memberLocation.deleteMany({
    where: { tripId, updatedAt: { lt: new Date(Date.now() - RETENTION_MS) } },
  })

  const [members, locations, checkpoints] = await Promise.all([
    prisma.tripMember.findMany({
      where: { tripId, status: "ACTIVE" },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    }),
    prisma.memberLocation.findMany({ where: { tripId } }),
    prisma.checkpoint.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const now = Date.now()
  const byUser = new Map(locations.map((l) => [l.userId, l]))

  return {
    ok: true,
    members: members.map((m) => {
      const loc = byUser.get(m.userId)
      const fresh = loc ? now - loc.updatedAt.getTime() < LIVE_WINDOW_MS : false
      const status: LiveStatus = !loc ? "none" : loc.sharing && fresh ? "live" : "off"
      return {
        userId: m.userId,
        name: m.user.name ?? m.user.email?.split("@")[0] ?? null,
        image: m.user.image,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        updatedAt: loc?.updatedAt.toISOString() ?? null,
        status,
        offReason: status === "off" ? (loc?.sharing ? "stale" : (loc?.offReason ?? "unavailable")) : null,
        isMe: m.userId === user.id,
      }
    }),
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
  if (!isValidLatLng({ lat, lng })) {
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
