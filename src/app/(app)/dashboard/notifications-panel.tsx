"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Bell } from "lucide-react"

import type { NotificationData } from "@/lib/notifications"
import { NotificationRow, useOpenNotification } from "@/components/notification-row"

/** The dashboard's "what's new" section: latest notifications, each one a deep link. */
export function NotificationsPanel({ initial }: { initial: NotificationData[] }) {
  const [items, setItems] = React.useState(initial)
  const unread = items.filter((n) => !n.read).length
  const open = useOpenNotification((id) =>
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  )

  return (
    <section className="mt-8 border bg-card" aria-label="Notifications">
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-3">
          <Bell className="size-4 text-brand" />
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase">Notifications</h2>
          {unread > 0 && (
            <span className="bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
              {unread} new
            </span>
          )}
        </div>
        <Link
          href="/notifications"
          className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          View all
          <ArrowRight className="size-3.5" />
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          You&apos;re all caught up. New activity from your crews shows up here.
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationRow notification={n} onOpen={open} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
