"use client"

import * as React from "react"
import { Bell, CheckCheck } from "lucide-react"
import { isToday, isYesterday, format } from "date-fns"
import { cn } from "cn"

import type { NotificationData } from "@/lib/notifications"
import { markAllNotificationsRead } from "@/server/notifications"
import { NotificationRow, useOpenNotification } from "@/components/notification-row"
import { Button } from "@/components/ui/button"

function dayLabel(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "EEEE, d MMM")
}

/** Full inbox: filter by unread, grouped by day, mark-all-read. */
export function NotificationsList({
  tripId,
  initial,
}: {
  tripId: string
  initial: NotificationData[]
}) {
  const [items, setItems] = React.useState(initial)
  const [filter, setFilter] = React.useState<"all" | "unread">("all")

  const unread = items.filter((n) => !n.read).length
  const shown = filter === "unread" ? items.filter((n) => !n.read) : items

  const open = useOpenNotification((id) =>
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  )

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    await markAllNotificationsRead(tripId)
  }

  // Group consecutive items by calendar day (items arrive newest first).
  const groups: { label: string; rows: NotificationData[] }[] = []
  for (const n of shown) {
    const label = dayLabel(n.createdAt)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.rows.push(n)
    else groups.push({ label, rows: [n] })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex border" role="group" aria-label="Filter notifications">
          {(
            [
              ["all", "All"],
              ["unread", `Unread · ${unread}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "h-9 px-4 text-xs font-medium tracking-wide uppercase transition-colors",
                filter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={unread === 0} onClick={markAll}>
          <CheckCheck className="size-4" />
          Mark all as read
        </Button>
      </div>

      {shown.length === 0 ? (
        <div className="mt-6 border border-dashed bg-card/50 px-6 py-16 text-center">
          <Bell className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium">
            {filter === "unread" ? "Nothing unread" : "No notifications yet"}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            When your crew votes, opens a poll, suggests gear or adds an expense on this trip, you&apos;ll see it here.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="mb-2 text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
                {g.label}
              </h2>
              <ul className="divide-y border bg-card">
                {g.rows.map((n) => (
                  <li key={n.id}>
                    <NotificationRow notification={n} onOpen={open} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
