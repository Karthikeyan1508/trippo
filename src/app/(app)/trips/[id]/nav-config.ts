/**
 * Sidebar structure for the trip page. Plain data (no React) so both the
 * server page (which decides what's allowed) and the client nav (which draws
 * it) can share it. Icons are referenced by name for the same reason.
 */

export type NavIcon =
  | "overview"
  | "itinerary"
  | "gear"
  | "preferences"
  | "chat"
  | "crew"
  | "insights"
  | "settings"
  | "prep"
  | "live"
  | "budget"
  | "story"
  | "notifications"

export type NavItem = {
  value: string
  label: string
  icon: NavIcon
  adminOnly?: boolean
}

export type NavGroup = { label: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Plan",
    items: [
      { value: "overview", label: "Overview", icon: "overview" },
      { value: "itinerary", label: "Itinerary", icon: "itinerary" },
      { value: "gear", label: "Gear & shopping", icon: "gear" },
    ],
  },
  {
    label: "Group",
    items: [
      { value: "preferences", label: "My preferences", icon: "preferences" },
      { value: "chat", label: "Crew chat", icon: "chat" },
      { value: "members", label: "Crew", icon: "crew" },
      { value: "notifications", label: "Notifications", icon: "notifications" },
      { value: "insights", label: "Group insights", icon: "insights", adminOnly: true },
      { value: "settings", label: "Trip settings", icon: "settings", adminOnly: true },
    ],
  },
  {
    label: "On the trip",
    items: [
      { value: "prep", label: "Prep & packing", icon: "prep" },
      { value: "live", label: "Live map", icon: "live" },
      { value: "budget", label: "Budget", icon: "budget" },
      { value: "story", label: "Story", icon: "story" },
    ],
  },
]

/** Section values the current viewer may open (guards `?tab=`). */
export function allowedTabs(isAdmin: boolean) {
  return NAV_GROUPS.flatMap((g) => g.items)
    .filter((i) => !i.adminOnly || isAdmin)
    .map((i) => i.value)
}

/**
 * Sections that moved. Old links (bookmarks, notifications, shared URLs) still land somewhere sensible:
 * stays and polls are now part of the crew chat.
 */
export const TAB_ALIASES: Record<string, string> = {
  stay: "chat",
  decisions: "chat",
}
