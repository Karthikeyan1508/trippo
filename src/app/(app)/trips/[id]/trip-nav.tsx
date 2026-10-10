"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"
import {
  BarChart3,
  Bell,
  Clapperboard,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  MessagesSquare,
  Route,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { getChatUnread } from "@/server/chat"
import { NavMenuButton } from "./nav-menu-button"
import { useTripTab } from "./trip-tabs"
import { NAV_GROUPS, type NavIcon } from "./nav-config"

const ICONS: Record<NavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  itinerary: Route,
  gear: ShoppingBag,
  preferences: SlidersHorizontal,
  chat: MessagesSquare,
  crew: Users,
  insights: BarChart3,
  settings: Settings,
  prep: ListChecks,
  live: MapIcon,
  budget: Wallet,
  story: Clapperboard,
  notifications: Bell,
}

/** Sections that need this person's attention show a dot. Nothing else is counted. */
export type NavBadges = Record<string, number | "dot">

/** The chat's unread count, refreshed in the background so the sidebar stays honest from any section. */
function useChatUnread(tripId: string, initial: number) {
  const [count, setCount] = React.useState(initial)
  React.useEffect(() => {
    let alive = true
    const refresh = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const n = await getChatUnread(tripId)
        if (alive) setCount(n)
      } catch {
        /* offline: keep the last count */
      }
    }
    const timer = window.setInterval(refresh, 20_000)
    window.addEventListener("focus", refresh)
    return () => {
      alive = false
      window.clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [tripId])
  return count
}

export function TripNav({
  tripId,
  isAdmin,
  badges: serverBadges,
}: {
  tripId: string
  isAdmin: boolean
  badges: NavBadges
}) {
  const { tab } = useTripTab()
  const chatUnread = useChatUnread(tripId, typeof serverBadges.chat === "number" ? serverBadges.chat : 0)
  // Reading the chat is how its badge clears, so don't show it while you're in it.
  const badges: NavBadges = { ...serverBadges }
  if (chatUnread > 0 && tab !== "chat") badges.chat = chatUnread
  else delete badges.chat

  return (
    <TabsPrimitive.List asChild>
      <SidebarContent className="gap-7 px-4 py-6">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin)
          return (
            <SidebarGroup key={group.label} className="p-0">
              <SidebarGroupLabel className="mb-2 h-auto px-3 text-[10px] font-medium tracking-[0.2em] text-muted-foreground/70 uppercase">
                {group.label}
              </SidebarGroupLabel>
              <SidebarMenu className="gap-1">
                {items.map((item) => {
                  const Icon = ICONS[item.icon]
                  const needsAttention = Boolean(badges[item.value])
                  return (
                    <SidebarMenuItem key={item.value}>
                      <TabsPrimitive.Trigger value={item.value} asChild>
                        <NavMenuButton
                          tooltip={item.label}
                          className={[
                            "relative h-11 gap-3.5 px-3 text-[13px] text-muted-foreground",
                            "hover:bg-foreground/5 hover:text-foreground",
                            "data-[state=active]:bg-foreground/[0.07] data-[state=active]:font-medium data-[state=active]:text-foreground",
                            "data-[state=active]:[&_svg]:text-brand",
                            // a hairline marker on the active row's leading edge
                            "data-[state=active]:before:absolute data-[state=active]:before:inset-y-2.5 data-[state=active]:before:left-0 data-[state=active]:before:w-0.5 data-[state=active]:before:bg-primary data-[state=active]:before:content-['']",
                            "[&_svg]:size-[18px]",
                          ].join(" ")}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </NavMenuButton>
                      </TabsPrimitive.Trigger>
                      {needsAttention && (
                        <SidebarMenuBadge className="top-1/2! right-3 -translate-y-1/2">
                          {(item.value === "notifications" || item.value === "chat") && typeof badges[item.value] === "number" ? (
                            <span
                              className="grid min-w-4 place-items-center bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums"
                              role="img"
                              aria-label={`${badges[item.value]} unread`}
                            >
                              {(badges[item.value] as number) > 9 ? "9+" : badges[item.value]}
                            </span>
                          ) : (
                            <span
                              className="size-1.5 bg-primary"
                              role="img"
                              aria-label="Needs your attention"
                            />
                          )}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          )
        })}
      </SidebarContent>
    </TabsPrimitive.List>
  )
}
