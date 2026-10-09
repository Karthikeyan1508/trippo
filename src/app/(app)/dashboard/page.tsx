import { Compass } from "lucide-react"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { claimPendingInvites } from "@/server/trips"
import { tripAttention, tripPhase, phaseLabel } from "@/lib/journey"
import { effectiveStatus } from "@/lib/trip-status"
import { resolveCovers } from "@/server/cover"
import { Button } from "@/components/ui/button"
import { listNotifications } from "@/server/notifications"
import { CreateTripDialog } from "./create-trip-dialog"
import { NotificationsPanel } from "./notifications-panel"
import { TripCard, type TripCardData } from "./trip-card"

function Section({
  title,
  trips,
}: {
  title: string
  trips: TripCardData[]
}) {
  if (trips.length === 0) return null
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))}
      </div>
    </section>
  )
}

export default async function DashboardPage() {
  const user = await requireUser()

  // Turn any pending email invites into memberships before listing trips.
  await claimPendingInvites()

  const trips = await prisma.trip.findMany({
    where: { members: { some: { userId: user.id } } },
    include: {
      members: {
        orderBy: { joinedAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          preference: { select: { id: true } },
        },
      },
      itineraries: {
        orderBy: { generatedAt: "desc" },
        take: 1,
        select: {
          status: true,
          approvals: { select: { userId: true, status: true } },
        },
      },
    },
    orderBy: { startDate: "asc" },
  })

  // Destination photos: looked up once per trip, then served from the database.
  const covers = await resolveCovers(trips)
  const notifications = await listNotifications(5)

  const cards: (TripCardData & { phase: "upcoming" | "ongoing" | "past" })[] =
    trips.map((t) => {
      const plan = t.itineraries[0]
      return {
        id: t.id,
        name: t.name,
        destination: t.destination,
        startDate: t.startDate,
        endDate: t.endDate,
        tripType: t.tripType,
        status: effectiveStatus(t.status, t.startDate, t.endDate),
        phaseText: phaseLabel(t.startDate, t.endDate),
        phase: tripPhase(t.startDate, t.endDate).phase,
        coverImage: covers.get(t.id) || null,
        memberCount: t.members.length,
        myRole: t.members.find((m) => m.userId === user.id)?.role ?? "MEMBER",
        attention: tripAttention({
          viewerId: user.id,
          members: t.members.map((m) => ({
            userId: m.userId,
            role: m.role,
            hasPreference: !!m.preference,
          })),
          plan: plan
            ? { locked: plan.status === "FINAL", approvals: plan.approvals }
            : null,
        }),
        members: t.members.slice(0, 4).map((m) => ({
          name: m.user.name ?? m.user.email?.split("@")[0] ?? null,
          image: m.user.image,
        })),
      }
    })

  const ongoing = cards.filter((c) => c.phase === "ongoing")
  const upcoming = cards.filter((c) => c.phase === "upcoming")
  const past = cards.filter((c) => c.phase === "past").reverse()
  const needAttention = cards.filter((c) => c.attention && c.phase !== "past").length

  const firstName = user.name?.split(" ")[0] ?? "there"

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Hey {firstName}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {cards.length === 0
              ? "Let's plan your first trip."
              : needAttention > 0
                ? `${needAttention} ${needAttention === 1 ? "trip needs" : "trips need"} something from you.`
                : "Everything's on track."}
          </p>
        </div>
        {cards.length > 0 && <CreateTripDialog />}
      </div>

      <NotificationsPanel initial={notifications} />

      {cards.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-brand">
            <Compass className="size-7" />
          </div>
          <h2 className="text-lg font-semibold">No trips yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create a trip, send your friends the invite link, and plan it together.
            Got an invite link? Just open it.
          </p>
          <div className="mt-6">
            <CreateTripDialog
              trigger={<Button size="lg">Create your first trip</Button>}
            />
          </div>
        </div>
      ) : (
        <>
          <Section title="Happening now" trips={ongoing} />
          <Section title="Upcoming" trips={upcoming} />
          <Section title="Past trips" trips={past} />
        </>
      )}
    </div>
  )
}
