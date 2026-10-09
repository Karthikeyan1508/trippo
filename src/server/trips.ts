"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { addDays } from "date-fns"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { adminContext, isLastAdmin, membershipFor } from "@/lib/access"
import { newJoinCode } from "@/lib/join-code"
import { syncPlanState } from "@/lib/plan-state"
import { notify, personName } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"
import {
  createTripSchema,
  inviteSchema,
  preferenceSchema,
  toInt,
  type CreateTripInput,
  type InviteInput,
  type PreferenceInput,
} from "@/lib/validators"

// Prisma enum unions (kept local so this file doesn't pull enum values in).
type RoleT = "ADMIN" | "MEMBER" | "OBSERVER"
type TripTypeT = "LEISURE" | "ADVENTURE" | "PILGRIMAGE" | "PARTY" | "WORKATION"
type DietT = "VEG" | "NON_VEG" | "VEGAN" | "JAIN" | "EGGETARIAN"
type PaceT = "RELAXED" | "PACKED"

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; error: string }

function firstError(issues: { message: string }[]) {
  return issues[0]?.message ?? "Please check the form and try again."
}

/** Create a trip and make the current user its admin. */
export async function createTrip(raw: CreateTripInput) {
  const user = await requireUser()
  const parsed = createTripSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false as const, error: firstError(parsed.error.issues) }
  }
  const d = parsed.data

  const trip = await prisma.trip.create({
    data: {
      name: d.name,
      destination: d.destination,
      originCity: d.originCity ? d.originCity : null,
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      tripType: d.tripType as TripTypeT,
      budgetPerPerson: toInt(d.budgetPerPerson),
      currency: d.currency,
      joinCode: newJoinCode(),
      createdById: user.id,
      members: {
        create: { userId: user.id, role: "ADMIN", status: "ACTIVE" },
      },
    },
  })

  redirect(`/trips/${trip.id}`)
}

/** Invite someone by email. Existing users join immediately; others get a pending invite. */
export async function inviteMember(
  tripId: string,
  raw: InviteInput
): Promise<ActionResult<{ added: boolean }>> {
  const user = await requireUser()
  const parsed = inviteSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error.issues) }
  }
  const { email, role } = parsed.data

  const admin = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: user.id } },
  })
  if (!admin || admin.role !== "ADMIN") {
    return { ok: false, error: "Only the trip admin can invite people." }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    const already = await prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: existing.id } },
    })
    if (already) {
      return { ok: false, error: "That person is already on the trip." }
    }
    await prisma.tripMember.create({
      data: {
        tripId,
        userId: existing.id,
        role: role as RoleT,
        status: "ACTIVE",
      },
    })
    const added = await prisma.trip.findUnique({ where: { id: tripId }, select: { name: true } })
    await notify({
      tripId,
      actorId: user.id,
      to: { users: [existing.id] },
      type: "added_to_trip",
      title: `${personName(user)} added you to a trip`,
      body: added?.name,
      url: tripUrl(tripId, "preferences"),
    })
    revalidatePath(`/trips/${tripId}`)
    return { ok: true, added: true }
  }

  const dupe = await prisma.invite.findFirst({
    where: { tripId, email, status: "PENDING" },
  })
  if (dupe) {
    return { ok: false, error: "There's already a pending invite for that email." }
  }

  await prisma.invite.create({
    data: {
      tripId,
      email,
      role: role as RoleT,
      invitedById: user.id,
      expiresAt: addDays(new Date(), 14),
    },
  })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true, added: false }
}

/** Revoke a pending invite. */
export async function revokeInvite(
  tripId: string,
  inviteId: string
): Promise<ActionResult> {
  const user = await requireUser()
  const admin = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: user.id } },
  })
  if (!admin || admin.role !== "ADMIN") {
    return { ok: false, error: "Only the trip admin can manage invites." }
  }
  await prisma.invite.updateMany({
    where: { id: inviteId, tripId, status: "PENDING" },
    data: { status: "REVOKED" },
  })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true }
}

/** Save (upsert) the current member's preferences for a trip. */
export async function savePreference(
  tripId: string,
  raw: PreferenceInput
): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = preferenceSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error.issues) }
  }
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: user.id } },
  })
  if (!member) {
    return { ok: false, error: "You're not a member of this trip." }
  }

  const d = parsed.data
  const data = {
    age: toInt(d.age),
    gender: d.gender ? d.gender : null,
    diet: d.diet ? (d.diet as DietT) : null,
    stayTypes: d.stayTypes ?? [],
    transports: d.transports ?? [],
    interests: d.interests ?? [],
    pace: d.pace ? (d.pace as PaceT) : null,
    budgetPerDay: toInt(d.budgetPerDay),
    accessibility: d.accessibility ? d.accessibility : null,
    mustCoverPlaces: d.mustCoverPlaces ? d.mustCoverPlaces : null,
  }

  await prisma.preference.upsert({
    where: { tripMemberId: member.id },
    create: { tripMemberId: member.id, ...data },
    update: data,
  })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true }
}

/**
 * Convert any pending email invites for the signed-in user into memberships.
 * Called when the dashboard loads so invites "just work" without email delivery.
 */
export async function claimPendingInvites() {
  const user = await requireUser()
  if (!user.email) return

  const invites = await prisma.invite.findMany({
    where: { email: user.email, status: "PENDING" },
    include: { trip: { select: { name: true } } },
  })
  if (invites.length === 0) return

  for (const inv of invites) {
    await prisma.tripMember.upsert({
      where: { tripId_userId: { tripId: inv.tripId, userId: user.id } },
      create: {
        tripId: inv.tripId,
        userId: user.id,
        role: inv.role,
        status: "ACTIVE",
      },
      update: {},
    })
    await prisma.invite.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED" },
    })
    await notify({
      tripId: inv.tripId,
      actorId: user.id,
      to: "admins",
      type: "member_joined",
      title: `${personName(user)} joined the trip`,
      body: inv.trip.name,
      url: tripUrl(inv.tripId, "members"),
    })
  }
}

// ─────────────────────────────────────────────────────────────────────
// Joining via the shareable invite link
// ─────────────────────────────────────────────────────────────────────

/** Join a trip from its /join/<code> link, then land on the preferences step. */
export async function joinTrip(code: string): Promise<ActionResult> {
  const user = await requireUser()
  const trip = await prisma.trip.findUnique({
    where: { joinCode: code },
    select: { id: true, status: true, name: true },
  })
  if (!trip) return { ok: false, error: "This invite link is no longer valid." }
  if (trip.status === "ARCHIVED") {
    return { ok: false, error: "This trip has been archived." }
  }

  const alreadyMember = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId: trip.id, userId: user.id } },
  })
  await prisma.tripMember.upsert({
    where: { tripId_userId: { tripId: trip.id, userId: user.id } },
    create: { tripId: trip.id, userId: user.id, role: "MEMBER", status: "ACTIVE" },
    update: {},
  })
  if (!alreadyMember) {
    await notify({
      tripId: trip.id,
      actorId: user.id,
      to: "admins",
      type: "member_joined",
      title: `${personName(user)} joined the trip`,
      body: trip.name,
      url: tripUrl(trip.id, "members"),
    })
  }
  // Joining by link also fulfils any email invite sent to the same address.
  if (user.email) {
    await prisma.invite.updateMany({
      where: { tripId: trip.id, email: user.email, status: "PENDING" },
      data: { status: "ACCEPTED" },
    })
  }

  // The new plan needs this person's vote too.
  await syncPlanState(trip.id)
  revalidatePath(`/trips/${trip.id}`)
  redirect(`/trips/${trip.id}?tab=preferences`)
}

/** Replace the invite link (the old one stops working). Admin only. */
export async function regenerateJoinCode(
  tripId: string
): Promise<ActionResult<{ code: string }>> {
  const ctx = await adminContext(tripId, "reset the invite link")
  if (!ctx.ok) return ctx
  const code = newJoinCode()
  await prisma.trip.update({ where: { id: tripId }, data: { joinCode: code } })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true, code }
}

// ─────────────────────────────────────────────────────────────────────
// Crew management
// ─────────────────────────────────────────────────────────────────────

/** Change a member's role. A trip must always keep at least one admin. */
export async function updateMemberRole(
  tripId: string,
  memberId: string,
  role: RoleT
): Promise<ActionResult> {
  const ctx = await adminContext(tripId, "change roles")
  if (!ctx.ok) return ctx
  if (!["ADMIN", "MEMBER", "OBSERVER"].includes(role)) {
    return { ok: false, error: "Unknown role." }
  }
  const target = await prisma.tripMember.findFirst({
    where: { id: memberId, tripId },
  })
  if (!target) return { ok: false, error: "Member not found." }
  if (role !== "ADMIN" && (await isLastAdmin(tripId, target.userId))) {
    return {
      ok: false,
      error: "Make someone else an admin first. A trip needs at least one.",
    }
  }
  await prisma.tripMember.update({ where: { id: memberId }, data: { role } })
  await syncPlanState(tripId) // observers no longer vote
  if (target.userId !== ctx.user.id) {
    const t = await prisma.trip.findUnique({ where: { id: tripId }, select: { name: true } })
    await notify({
      tripId,
      actorId: ctx.user.id,
      to: { users: [target.userId] },
      type: "role_changed",
      title: `You're now ${role === "ADMIN" ? "an admin" : role === "MEMBER" ? "a member" : "an observer"}`,
      body: t?.name,
      url: tripUrl(tripId),
    })
  }
  revalidatePath(`/trips/${tripId}`)
  return { ok: true }
}

async function detachMember(tripId: string, userId: string) {
  await prisma.$transaction([
    prisma.approval.deleteMany({
      where: { userId, itinerary: { tripId } },
    }),
    prisma.checklistItem.deleteMany({ where: { tripId, userId } }),
    prisma.memberLocation.deleteMany({ where: { tripId, userId } }),
    prisma.pollVote.deleteMany({ where: { userId, poll: { tripId } } }),
    prisma.productVote.deleteMany({ where: { userId, product: { tripId } } }),
    prisma.tripMember.delete({
      where: { tripId_userId: { tripId, userId } },
    }),
  ])
  await syncPlanState(tripId)
  revalidatePath(`/trips/${tripId}`)
}

/** Remove someone from the trip. Admin only (use leaveTrip for yourself). */
export async function removeMember(
  tripId: string,
  memberId: string
): Promise<ActionResult> {
  const ctx = await adminContext(tripId, "remove people")
  if (!ctx.ok) return ctx
  const target = await prisma.tripMember.findFirst({
    where: { id: memberId, tripId },
  })
  if (!target) return { ok: false, error: "Member not found." }
  if (target.userId === ctx.user.id) {
    return { ok: false, error: "Use “Leave trip” to remove yourself." }
  }
  const t = await prisma.trip.findUnique({ where: { id: tripId }, select: { name: true } })
  await detachMember(tripId, target.userId)
  await notify({
    tripId,
    actorId: ctx.user.id,
    to: { users: [target.userId] },
    type: "role_changed",
    title: "You were removed from a trip",
    body: t?.name,
    url: "/dashboard",
  })
  return { ok: true }
}

/** Leave a trip. The last admin must hand over (or delete the trip) first. */
export async function leaveTrip(tripId: string): Promise<ActionResult> {
  const { user, member } = await membershipFor(tripId)
  if (!member) return { ok: false, error: "You're not on this trip." }
  if (await isLastAdmin(tripId, user.id)) {
    return {
      ok: false,
      error: "You're the only admin. Make someone else an admin, or delete the trip.",
    }
  }
  await detachMember(tripId, user.id)
  redirect("/dashboard")
}

// ─────────────────────────────────────────────────────────────────────
// Trip details
// ─────────────────────────────────────────────────────────────────────

/** Edit the trip's basics. Admin only. */
export async function updateTrip(
  tripId: string,
  raw: CreateTripInput
): Promise<ActionResult> {
  const ctx = await adminContext(tripId, "edit trip details")
  if (!ctx.ok) return ctx
  const parsed = createTripSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error.issues) }
  }
  const d = parsed.data
  await prisma.trip.update({
    where: { id: tripId },
    data: {
      name: d.name,
      destination: d.destination,
      originCity: d.originCity ? d.originCity : null,
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      tripType: d.tripType as TripTypeT,
      budgetPerPerson: toInt(d.budgetPerPerson),
      currency: d.currency,
    },
  })
  await notify({
    tripId,
    actorId: ctx.user.id,
    to: "others",
    type: "trip_updated",
    title: `${personName(ctx.user)} updated the trip details`,
    body: d.name,
    url: tripUrl(tripId),
  })
  revalidatePath(`/trips/${tripId}`)
  revalidatePath("/dashboard")
  return { ok: true }
}

/** Permanently delete the trip and everything in it. Admin only. */
export async function deleteTrip(tripId: string): Promise<ActionResult> {
  const ctx = await adminContext(tripId, "delete the trip")
  if (!ctx.ok) return ctx
  await prisma.trip.delete({ where: { id: tripId } })
  revalidatePath("/dashboard")
  redirect("/dashboard")
}
