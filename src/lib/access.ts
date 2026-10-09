import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"

export type Failure = { ok: false; error: string }

/** The signed-in user plus their membership of a trip (null if not a member). */
export async function membershipFor(tripId: string) {
  const user = await requireUser()
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: user.id } },
  })
  return { user, member }
}

/**
 * Resolves an admin-only context, or a ready-to-return failure.
 * Usage:  const ctx = await adminContext(tripId); if (!ctx.ok) return ctx
 */
export async function adminContext(tripId: string, action = "do that") {
  const { user, member } = await membershipFor(tripId)
  if (!member) return { ok: false, error: "You're not a member of this trip." } as Failure
  if (member.role !== "ADMIN") {
    return { ok: false, error: `Only the trip admin can ${action}.` } as Failure
  }
  return { ok: true as const, user, member }
}

/** True if removing/demoting `userId` would leave the trip without an admin. */
export async function isLastAdmin(tripId: string, userId: string) {
  const admins = await prisma.tripMember.findMany({
    where: { tripId, role: "ADMIN" },
    select: { userId: true },
  })
  return admins.length === 1 && admins[0].userId === userId
}
