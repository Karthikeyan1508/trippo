"use client"

import Link from "next/link"

import { NotificationBell } from "@/components/notification-bell"
import { ThemeToggleButton } from "@/components/theme-switcher"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NAV_GROUPS } from "./nav-config"
import { TripCommand } from "./trip-command"
import { TabLink, useTripTab } from "./trip-tabs"

const LABELS: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.value, i.label])
)

/**
 * The slim glass bar above every section: where you are (breadcrumb), search,
 * theme, and the invite action (passed in as a slot since it's server-built).
 */
export function TripTopBar({
  tripId,
  tripName,
  isAdmin,
  unreadCount,
  actions,
}: {
  tripId: string
  tripName: string
  isAdmin: boolean
  unreadCount: number
  actions?: React.ReactNode
}) {
  const { tab } = useTripTab()

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/60 px-4 backdrop-blur-xl lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="!h-5" />

      <Breadcrumb className="min-w-0 flex-1 overflow-hidden">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden lg:inline-flex">
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Trips</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden lg:block" />
          <BreadcrumbItem className="hidden min-w-0 max-w-[14rem] lg:inline-flex">
            <BreadcrumbLink asChild>
              <TabLink tab="overview" className="truncate">
                {tripName}
              </TabLink>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden lg:block" />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate font-medium">
              {LABELS[tab] ?? "Overview"}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex shrink-0 items-center gap-1.5">
        <TripCommand isAdmin={isAdmin} />
        <NotificationBell tripId={tripId} initialUnread={unreadCount} />
        <ThemeToggleButton />
        {actions}
      </div>
    </header>
  )
}
