"use client"

import * as React from "react"
import Link from "next/link"
import { Bell, CheckCheck } from "lucide-react"

import type { NotificationData } from "@/lib/notifications"
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
} from "@/server/notifications"
import { NotificationRow, useOpenNotification } from "@/components/notification-row"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"

const POLL_MS = 45_000

/** Header bell: live unread count, and the latest notifications in a dropdown. */
export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const [unread, setUnread] = React.useState(initialUnread)
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<NotificationData[] | null>(null)

  // Keep the count fresh without any realtime infrastructure: poll, and
  // refresh whenever the tab regains focus.
  React.useEffect(() => {
    let alive = true
    const refresh = async () => {
      try {
        const count = await getUnreadCount()
        if (alive) setUnread(count)
      } catch {
        /* offline or signed out, keep the last known count */
      }
    }
    const timer = setInterval(refresh, POLL_MS)
    window.addEventListener("focus", refresh)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setItems(null)
      listNotifications(10).then(setItems, () => setItems([]))
    }
  }

  const openNotification = useOpenNotification((id) => {
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? prev)
    setUnread((u) => Math.max(0, u - 1))
  })

  async function markAll() {
    setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev)
    setUnread(0)
    await markAllNotificationsRead()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] gap-0 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-xs font-semibold tracking-[0.18em] uppercase">Notifications</h2>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 h-7 gap-1.5 text-xs text-muted-foreground"
            disabled={unread === 0}
            onClick={markAll}
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
        </div>

        <div className="max-h-[26rem] overflow-y-auto">
          {items === null ? (
            <div className="space-y-4 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="size-9 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Bell className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">You&apos;re all caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Votes, polls, gear picks and expenses show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationRow
                    notification={n}
                    onOpen={(item) => {
                      setOpen(false)
                      openNotification(item)
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block px-5 py-3 text-center text-xs font-medium tracking-wider uppercase transition-colors hover:bg-foreground/5"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
