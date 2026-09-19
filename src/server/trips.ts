"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { addDays } from "date-fns"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
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
  }
}
