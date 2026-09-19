import Link from "next/link"
import { CalendarDays, MapPin, Crown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  formatDateRange,
  prettifyEnum,
  tripDurationDays,
} from "@/lib/format"

export type TripCardData = {
  id: string
  name: string
  destination: string
  startDate: Date
  endDate: Date
  tripType: string
  status: string
  memberCount: number
  myRole: string
  members: { name: string | null; image: string | null }[]
}

const STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planning",
  VOTING: "Voting",
  CONFIRMED: "Confirmed",
  ACTIVE: "On trip",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
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
    <Link
      href={`/trips/${trip.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      {/* Cover */}
      <div className="relative h-24 bg-gradient-to-br from-primary to-primary/60 p-4">
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            {prettifyEnum(trip.tripType)}
          </span>
          <span className="rounded-full bg-black/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            {STATUS_LABEL[trip.status] ?? trip.status}
          </span>
        </div>
        <span className="absolute bottom-3 left-4 flex items-center gap-1.5 text-sm font-medium text-white">
          <MapPin className="size-4" />
          <span className="line-clamp-1">{trip.destination}</span>
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 text-base font-semibold tracking-tight transition-colors group-hover:text-primary">
          {trip.name}
        </h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" />
          {formatDateRange(trip.startDate, trip.endDate)}
          <span className="text-xs">· {days}d</span>
        </p>

        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <div className="flex items-center">
            <div className="flex -space-x-2">
              {trip.members.map((m, i) => (
                <Avatar key={i} className="size-7 ring-2 ring-card">
                  <AvatarImage src={m.image ?? undefined} alt={m.name ?? ""} />
                  <AvatarFallback className="text-[10px]">
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            {extra > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                +{extra}
              </span>
            )}
          </div>
          {trip.myRole === "ADMIN" && (
            <Badge variant="secondary" className="gap-1">
              <Crown className="size-3" />
              Admin
            </Badge>
          )}
        </div>
      </div>
    </Link>
  )
}
