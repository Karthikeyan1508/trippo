import { Compass } from "lucide-react"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { claimPendingInvites } from "@/server/trips"
import { Button } from "@/components/ui/button"
import { CreateTripDialog } from "./create-trip-dialog"
import { TripCard, type TripCardData } from "./trip-card"

export default async function DashboardPage() {
  const user = await requireUser()

  // Turn any pending email invites into memberships before listing trips.
  await claimPendingInvites()

  const trips = await prisma.trip.findMany({
    where: { members: { some: { userId: user.id } } },
    include: {
      _count: { select: { members: true } },
      members: {
        orderBy: { joinedAt: "asc" },
        include: { user: { select: { id: true, name: true, image: true } } },
      },
    },
    orderBy: { startDate: "asc" },
  })

  const cards: TripCardData[] = trips.map((t) => ({
    id: t.id,
    name: t.name,
    destination: t.destination,
    startDate: t.startDate,
    endDate: t.endDate,
    tripType: t.tripType,
    status: t.status,
    memberCount: t._count.members,
    myRole: t.members.find((m) => m.userId === user.id)?.role ?? "MEMBER",
    members: t.members
      .slice(0, 4)
      .map((m) => ({ name: m.user.name, image: m.user.image })),
  }))

  const firstName = user.name?.split(" ")[0] ?? "there"

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Hey {firstName} 👋
          </h1>
          <p className="mt-1 text-muted-foreground">
            {cards.length > 0
              ? `You're part of ${cards.length} trip${
                  cards.length > 1 ? "s" : ""
                }.`
              : "Let's plan your first trip."}
          </p>
        </div>
        {cards.length > 0 && <CreateTripDialog />}
      </div>

      {cards.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Compass className="size-7" />
          </div>
          <h2 className="text-lg font-semibold">No trips yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create a trip, invite your friends, and start planning together.
          </p>
          <div className="mt-6">
            <CreateTripDialog
              trigger={<Button size="lg">Create your first trip</Button>}
            />
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  )
}
