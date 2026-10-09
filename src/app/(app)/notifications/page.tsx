import { redirect } from "next/navigation"

/** Notifications now live inside each trip. Old links land on the trips list. */
export default function NotificationsPage() {
  redirect("/dashboard")
}
