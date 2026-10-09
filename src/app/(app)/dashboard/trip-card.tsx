import Link from "next/link"
import { ArrowRight, Bell, CalendarDays, Crown, MapPin } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { TripCover } from "@/components/trip-cover"
import { formatDateRange, prettifyEnum, tripDurationDays } from "@/lib/format"
import { STATUS_LABEL } from "@/lib/trip-status"

export type TripCardData = {
  id: string
  name: string
  destination: string
  startDate: Date
  endDate: Date
  tripType: string
  /** Effective status (calendar-aware). */
  status: string
  /** "In 12 days" / "Day 2 of the trip" / "Trip ended" */
  phaseText: string
  /** Destination photo, if one has been found. */
  coverImage: string | null
  memberCount: number
  myRole: string
  /** What this person needs to do next on the trip, if anything. */
  attention: string | null
  members: { name: string | null; image: string | null }[]
  /** Unread notifications for this trip. */
  unread: number
}

function initials(name: string | null) {
  const s = name || "?"
  return s
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function TripCard({ trip }: { trip: TripCardData }) {
  const days = tripDurationDays(trip.startDate, trip.endDate)
  const extra = trip.memberCount - trip.members.length

  return (
    <div className="group relative transition-transform hover:-translate-y-0.5">
    <Link
      href={`/trips/${trip.id}`}
      className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-all group-hover:border-foreground/20 group-hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <TripCover src={trip.coverImage} className="flex h-44 flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2 text-[10px] font-medium tracking-widest uppercase">
          <span className="rounded-full bg-primary px-2.5 py-1 text-primary-foreground">
            {trip.phaseText}
          </span>
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-white backdrop-blur-md">
            {STATUS_LABEL[trip.status] ?? trip.status}
          </span>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-widest text-white/80 uppercase">
            <MapPin className="size-3.5" />
            <span className="line-clamp-1">{trip.destination}</span>
          </p>
          <h3 className="mt-1 line-clamp-2 text-xl leading-tight font-semibold tracking-tight">
            {trip.name}
          </h3>
        </div>
      </TripCover>

      <div className="flex flex-1 flex-col p-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" />
          {formatDateRange(trip.startDate, trip.endDate)}
          <span className="text-xs">
            · {days}d · {prettifyEnum(trip.tripType)}
          </span>
        </p>

        {trip.attention && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-sm font-medium text-foreground">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <span className="flex-1">{trip.attention}</span>
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </p>
        )}

        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <div className="flex items-center">
            <div className="flex -space-x-2">
              {trip.members.map((m, i) => (
                <Avatar key={i} className="size-7 ring-2 ring-card">
                  <AvatarImage src={m.image ?? undefined} alt={m.name ?? ""} />
                  <AvatarFallback className="text-[10px]">{initials(m.name)}</AvatarFallback>
                </Avatar>
              ))}
            </div>
            {extra > 0 && <span className="ml-2 text-xs text-muted-foreground">+{extra}</span>}
          </div>
          {trip.myRole === "ADMIN" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
              <Crown className="size-3" />
              Admin
            </span>
          )}
        </div>
      </div>
    </Link>

    {/* A sibling of the card link (links can't nest): this trip's notifications. */}
    <Link
      href={`/trips/${trip.id}?tab=notifications`}
      aria-label={
        trip.unread > 0
          ? `${trip.unread} unread ${trip.unread === 1 ? "notification" : "notifications"} on ${trip.name}`
          : `Notifications for ${trip.name}`
      }
      title={trip.unread > 0 ? `${trip.unread} unread` : "Notifications"}
      className="absolute top-32 right-3 grid size-9 place-items-center border border-white/25 bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/65 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Bell className={trip.unread > 0 ? "size-4" : "size-4 opacity-70"} />
      {trip.unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center bg-primary px-1 text-[10px] leading-5 font-semibold text-primary-foreground tabular-nums">
          {trip.unread > 9 ? "9+" : trip.unread}
        </span>
      )}
    </Link>
    </div>
  )
}
