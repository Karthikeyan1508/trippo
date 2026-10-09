import Link from "next/link"
import { Compass, MapPin } from "lucide-react"

import { TripCover } from "@/components/trip-cover"
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

/**
 * Top of the trip sidebar. Deliberately quiet: the Trippo mark, and one photo
 * banner carrying only the trip's name and destination. Everything else
 * (dates, status, progress) lives on the Overview where there is room.
 * The banner folds away when the sidebar collapses to icons.
 */
export function TripSidebarHeader({
  name,
  destination,
  coverImage,
  stagesDone,
  stagesTotal,
}: {
  name: string
  destination: string
  coverImage: string | null
  stagesDone: number
  stagesTotal: number
}) {
  const pct = stagesTotal ? Math.round((stagesDone / stagesTotal) * 100) : 0

  return (
    <SidebarHeader className="gap-5 px-4 pt-5 pb-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" asChild tooltip="All trips" className="px-0">
            <Link href="/dashboard">
              <div className="flex aspect-square size-9 items-center justify-center bg-primary text-primary-foreground">
                <Compass className="size-[18px]" />
              </div>
              <span className="text-base font-semibold tracking-tight">Trippo</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <div className="group-data-[collapsible=icon]:hidden">
        <TripCover src={coverImage} className="flex h-28 flex-col justify-end p-4">
          <h2 className="line-clamp-2 text-[15px] leading-snug font-semibold">{name}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/80">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{destination}</span>
          </p>
        </TripCover>
        <div
          role="progressbar"
          aria-label={`${stagesDone} of ${stagesTotal} planning stages complete`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-0.5 bg-foreground/10"
        >
          <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </SidebarHeader>
  )
}
