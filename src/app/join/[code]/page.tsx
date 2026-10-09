import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarDays, LinkIcon, MapPin, Users } from "lucide-react"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { formatDateRange, prettifyEnum, tripDurationDays } from "@/lib/format"
import { Logo } from "@/components/logo"
import { TripCover } from "@/components/trip-cover"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { JoinButton } from "./join-button"

function firstName(name: string | null) {
  return name?.split(" ")[0] ?? "Someone"
}

function initials(name: string | null) {
  return (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** What shows when the link is shared: the title and text; the image comes from opengraph-image.tsx. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const trip = await prisma.trip.findUnique({
    where: { joinCode: code },
    select: {
      name: true,
      destination: true,
      startDate: true,
      endDate: true,
      status: true,
      members: {
        orderBy: { joinedAt: "asc" },
        select: { role: true, user: { select: { name: true } } },
      },
    },
  })
  // Invite links are for the crew, not for search engines.
  const robots = { index: false, follow: false }
  if (!trip || trip.status === "ARCHIVED") {
    return { title: "Trip invite — Trippo", robots }
  }

  const inviter = (trip.members.find((m) => m.role === "ADMIN") ?? trip.members[0])?.user.name
  const who = inviter?.split(" ")[0] ?? "A friend"
  const title = `${who} invited you to ${trip.name}`
  const description = `${trip.destination} · ${formatDateRange(trip.startDate, trip.endDate)} · ${tripDurationDays(trip.startDate, trip.endDate)} days. Join the crew on Trippo to vote, plan and split costs together.`
  return {
    title,
    description,
    robots,
    openGraph: { title, description, type: "website", siteName: "Trippo" },
    twitter: { card: "summary_large_image", title, description },
  }
}

/** Public landing page for an invite link: preview the trip, then join. */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const session = await auth()

  const trip = await prisma.trip.findUnique({
    where: { joinCode: code },
    include: {
      members: {
        orderBy: { joinedAt: "asc" },
        include: { user: { select: { name: true, image: true } } },
      },
    },
  })

  const invalid = !trip || trip.status === "ARCHIVED"
  const inviter = trip
    ? (trip.members.find((m) => m.role === "ADMIN") ?? trip.members[0])
    : undefined

  // Already on the trip — skip straight to it.
  if (trip && session?.user?.id) {
    if (trip.members.some((m) => m.userId === session.user.id)) {
      redirect(`/trips/${trip.id}`)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>

        {invalid ? (
          <Card>
            <CardContent className="space-y-4 py-6 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                <LinkIcon className="size-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">This invite link isn&apos;t valid</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  It may have been reset by the trip admin. Ask them for a fresh link.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/dashboard">Go to my trips</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden pt-0">
            <TripCover src={trip.coverImage} className="flex min-h-44 flex-col justify-end p-6">
              <Badge className="mb-auto w-fit bg-primary text-primary-foreground hover:bg-primary">
                {prettifyEnum(trip.tripType)} trip
              </Badge>
              <p className="mt-6 text-sm text-white/80">
                {firstName(inviter?.user.name ?? null)} invited you to
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{trip.name}</h1>
            </TripCover>

            <CardContent className="space-y-5">
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-center gap-2.5">
                  <MapPin className="size-4 text-muted-foreground" />
                  {trip.destination}
                </li>
                <li className="flex items-center gap-2.5">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  {formatDateRange(trip.startDate, trip.endDate)} ·{" "}
                  {tripDurationDays(trip.startDate, trip.endDate)} days
                </li>
                <li className="flex items-center gap-2.5">
                  <Users className="size-4 text-muted-foreground" />
                  {trip.members.length} {trip.members.length === 1 ? "person" : "people"} going
                </li>
              </ul>

              <div className="flex -space-x-2">
                {trip.members.slice(0, 6).map((m) => (
                  <Avatar key={m.id} className="size-9 ring-2 ring-card">
                    <AvatarImage src={m.user.image ?? undefined} alt={m.user.name ?? ""} />
                    <AvatarFallback className="text-xs">{initials(m.user.name)}</AvatarFallback>
                  </Avatar>
                ))}
              </div>

              {session?.user ? (
                <div className="space-y-2">
                  <JoinButton code={code} />
                  <p className="text-center text-xs text-muted-foreground">
                    Joining as {session.user.email ?? session.user.name}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button asChild size="lg" className="h-12 w-full text-base">
                    <Link href={`/login?callbackUrl=${encodeURIComponent(`/join/${code}`)}`}>
                      Sign in to join
                    </Link>
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Takes a few seconds — you&apos;ll come straight back here.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
