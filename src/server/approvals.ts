"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { syncPlanState } from "@/lib/plan-state"
import { notify, personName } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"

type ActionResult = { ok: true; locked: boolean } | { ok: false; error: string }

/**
 * Record the current member's approval (or change request) for an itinerary.
 * When every non-observer member has approved, the plan locks and the trip
 * is marked CONFIRMED (see syncPlanState).
 */
export async function setApproval(
  itineraryId: string,
  status: "APPROVED" | "REJECTED",
  reason?: string
): Promise<ActionResult> {
  const user = await requireUser()

  const itinerary = await prisma.itinerary.findUnique({
    where: { id: itineraryId },
    include: { trip: { include: { members: true } } },
  })
  if (!itinerary) return { ok: false, error: "Plan not found." }

  const member = itinerary.trip.members.find((m) => m.userId === user.id)
  if (!member) return { ok: false, error: "You're not a member of this trip." }
  if (member.role === "OBSERVER") {
    return { ok: false, error: "Observers can't vote on the plan." }
  }

  // Only the newest plan can be voted on — older versions are history.
  const latest = await prisma.itinerary.findFirst({
    where: { tripId: itinerary.tripId },
    orderBy: { generatedAt: "desc" },
    select: { id: true },
  })
  if (latest?.id !== itineraryId) {
    return { ok: false, error: "This plan was replaced — refresh to see the latest." }
  }

  const cleanReason = reason?.trim() ? reason.trim().slice(0, 500) : null

  await prisma.approval.upsert({
    where: { itineraryId_userId: { itineraryId, userId: user.id } },
    create: { itineraryId, userId: user.id, status, reason: cleanReason },
    update: { status, reason: cleanReason },
  })

  const wasLocked = itinerary.status === "FINAL"
  const { locked } = await syncPlanState(itinerary.tripId)
  const tripId = itinerary.tripId

  if (status === "REJECTED") {
    await notify({
      tripId,
      actorId: user.id,
      to: "admins",
      type: "changes_requested",
      title: `${personName(user)} asked for changes`,
      body: cleanReason ?? itinerary.trip.name,
      url: tripUrl(tripId, "itinerary"),
    })
  }
  if (locked && !wasLocked) {
    await notify({
      tripId,
      actorId: user.id,
      to: "others",
      type: "plan_locked",
      title: "The plan is locked in",
      body: `Everyone approved · ${itinerary.trip.name}`,
      url: tripUrl(tripId, "itinerary"),
    })
  }

  revalidatePath(`/trips/${itinerary.tripId}`)
  return { ok: true, locked }
}
