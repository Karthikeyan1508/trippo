"use client"

import {
  Bed,
  Bell,
  CircleCheck,
  ListChecks,
  Lock,
  MessageSquare,
  MessageSquareWarning,
  Pencil,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserPlus,
  Vote,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "cn"

import { NOTIFICATION_ICONS, type NotificationData, type NotificationType } from "@/lib/notifications"
import { markNotificationRead } from "@/server/notifications"
import { RelativeTime } from "@/components/relative-time"

const ICONS: Record<string, LucideIcon> = {
  "user-plus": UserPlus,
  sparkles: Sparkles,
  pencil: Pencil,
  lock: Lock,
  message: MessageSquareWarning,
  chat: MessageSquare,
  check: CircleCheck,
  vote: Vote,
  bag: ShoppingBag,
  wallet: Wallet,
  list: ListChecks,
  bed: Bed,
  shield: ShieldCheck,
  bell: Bell,
}

/**
 * Opens a notification: marks it read, then takes the person to the page it's
 * about (e.g. the Decisions tab of the right trip).
 */
export function useOpenNotification(onRead?: (id: string) => void) {
  const router = useRouter()
  return (n: NotificationData) => {
    if (!n.read) {
      onRead?.(n.id)
      void markNotificationRead(n.id) // fire and forget, navigation shouldn't wait
    }
    router.push(n.url)
  }
}

export function NotificationRow({
  notification: n,
  onOpen,
  className,
}: {
  notification: NotificationData
  onOpen: (n: NotificationData) => void
  className?: string
}) {
  const Icon = ICONS[NOTIFICATION_ICONS[n.type as NotificationType] ?? "bell"] ?? Bell

  return (
    <a
      href={n.url}
      onClick={(event) => {
        // Let ctrl/cmd/middle-click open in a new tab as usual.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return
        event.preventDefault()
        onOpen(n)
      }}
      className={cn(
        "relative flex gap-4 px-5 py-4 transition-colors outline-none hover:bg-foreground/5 focus-visible:bg-foreground/5",
        className
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center",
          n.read ? "bg-muted text-muted-foreground" : "bg-primary/20 text-brand"
        )}
      >
        <Icon className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-snug", n.read ? "text-muted-foreground" : "font-medium")}>
          {n.title}
        </span>
        {n.body && (
          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
            {n.body}
          </span>
        )}
        <span className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {n.tripName && <span className="truncate">{n.tripName}</span>}
          {n.tripName && <span aria-hidden>·</span>}
          <RelativeTime iso={n.createdAt} className="shrink-0" />
        </span>
      </span>

      {!n.read && (
        <span className="mt-1.5 size-2 shrink-0 bg-primary" role="img" aria-label="Unread" />
      )}
    </a>
  )
}
