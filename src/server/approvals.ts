"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"

type ActionResult = { ok: true; locked: boolean } | { ok: false; error: string }

/**
 * Record the current member's approval (or change request) for an itinerary.
 * When every non-observer member has approved, the plan locks and the trip
 * is marked CONFIRMED.
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

  const cleanReason = reason?.trim() ? reason.trim().slice(0, 500) : null

  await prisma.approval.upsert({
    where: { itineraryId_userId: { itineraryId, userId: user.id } },
    create: { itineraryId, userId: user.id, status, reason: cleanReason },
    update: { status, reason: cleanReason },
  })

  // Recompute lock state across all non-observer members.
  const approvers = itinerary.trip.members.filter((m) => m.role !== "OBSERVER")
  const approvals = await prisma.approval.findMany({ where: { itineraryId } })
  const approvedIds = new Set(
    approvals.filter((a) => a.status === "APPROVED").map((a) => a.userId)
  )
  const locked =
    approvers.length > 0 && approvers.every((m) => approvedIds.has(m.userId))

  await prisma.itinerary.update({
    where: { id: itineraryId },
    data: { status: locked ? "FINAL" : "DRAFT" },
  })
  await prisma.trip.update({
    where: { id: itinerary.tripId },
    data: { status: locked ? "CONFIRMED" : "VOTING" },
  })

  revalidatePath(`/trips/${itinerary.tripId}`)
  return { ok: true, locked }
}
