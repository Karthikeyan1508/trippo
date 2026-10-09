import { requireUser } from "@/lib/session"
import { NotificationsList } from "@/components/notifications-list"
import { listNotifications } from "@/server/notifications"

export const metadata = { title: "Notifications — Trippo" }

export default async function NotificationsPage() {
  await requireUser()
  const notifications = await listNotifications(100)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Inbox</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Notifications</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Everything your crews have done. Click one to jump straight to it.
      </p>

      <div className="mt-8">
        <NotificationsList initial={notifications} />
      </div>
    </div>
  )
}
