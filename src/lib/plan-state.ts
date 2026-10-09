import { prisma } from "@/lib/prisma"

/**
 * Single source of truth for "is the plan approved?".
 *
 * Recomputes the latest itinerary's lock state from the CURRENT crew and votes
 * and keeps the trip's status in step. Call it after anything that can change
 * the answer: a vote, a member leaving/being removed/becoming an observer, or
 * the plan being edited (which clears votes first).
 */
export async function syncPlanState(tripId: string) {
  const [trip, itinerary, members] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId }, select: { status: true } }),
    prisma.itinerary.findFirst({
      where: { tripId },
      orderBy: { generatedAt: "desc" },
      include: { approvals: true },
    }),
    prisma.tripMember.findMany({ where: { tripId } }),
  ])
  if (!trip || !itinerary) return { locked: false, itineraryId: null }

  const voters = members.filter((m) => m.role !== "OBSERVER")
  const approvedBy = new Set(
    itinerary.approvals
      .filter((a) => a.status === "APPROVED")
      .map((a) => a.userId)
  )
  const locked =
    voters.length > 0 && voters.every((m) => approvedBy.has(m.userId))
  const anyVotes = itinerary.approvals.length > 0

  await prisma.itinerary.update({
    where: { id: itinerary.id },
    data: { status: locked ? "FINAL" : "DRAFT" },
  })

  // Only steer trips that are still in the planning lifecycle.
  if (["PLANNING", "VOTING", "CONFIRMED"].includes(trip.status)) {
    await prisma.trip.update({
      where: { id: tripId },
      data: { status: locked ? "CONFIRMED" : anyVotes ? "VOTING" : "PLANNING" },
    })
  }

  return { locked, itineraryId: itinerary.id }
}
