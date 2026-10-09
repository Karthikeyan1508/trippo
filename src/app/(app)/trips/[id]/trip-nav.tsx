"use client"

import { Tabs as TabsPrimitive } from "radix-ui"
import {
  BarChart3,
  Bell,
  BedDouble,
  Clapperboard,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  Route,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Users,
  Vote,
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
import { NavMenuButton } from "./nav-menu-button"
import { NAV_GROUPS, type NavIcon } from "./nav-config"

const ICONS: Record<NavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  itinerary: Route,
  stay: BedDouble,
  gear: ShoppingBag,
  preferences: SlidersHorizontal,
  decisions: Vote,
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

export function TripNav({
  isAdmin,
  badges,
}: {
  isAdmin: boolean
  badges: NavBadges
}) {
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
                          {item.value === "notifications" && typeof badges[item.value] === "number" ? (
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
