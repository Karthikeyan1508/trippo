/**
 * Notification types and presentation. Plain module so the server (which
 * creates notifications) and the client (which renders them) share one list.
 */

export type NotificationType =
  | "member_joined"
  | "added_to_trip"
  | "plan_ready"
  | "plan_changed"
  | "plan_locked"
  | "changes_requested"
  | "poll_created"
  | "gear_suggested"
  | "expense_added"
  | "expense_edit_requested"
  | "expense_edit_approved"
  | "expense_edit_rejected"
  | "payment_received"
  | "prep_ready"
  | "stay_chosen"
  | "chat_message"
  | "chat_mention"
  | "trippo_answer"
  | "itinerary_request"
  | "request_decided"
  | "poll_closed"
  | "role_changed"
  | "trip_updated"
  | "test"

/** Icon name per type; the client maps names to Lucide components. */
export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  member_joined: "user-plus",
  added_to_trip: "user-plus",
  plan_ready: "sparkles",
  plan_changed: "pencil",
  plan_locked: "lock",
  changes_requested: "message",
  poll_created: "vote",
  gear_suggested: "bag",
  expense_added: "wallet",
  expense_edit_requested: "pencil",
  expense_edit_approved: "check",
  expense_edit_rejected: "x",
  payment_received: "wallet",
  prep_ready: "list",
  stay_chosen: "bed",
  chat_message: "chat",
  chat_mention: "chat",
  trippo_answer: "sparkles",
  itinerary_request: "list",
  request_decided: "check",
  poll_closed: "vote",
  role_changed: "shield",
  trip_updated: "pencil",
  test: "bell",
}

export type NotificationData = {
  id: string
  type: string
  title: string
  body: string | null
  url: string
  read: boolean
  createdAt: string
  tripName: string | null
}

/** Where a trip section lives. */
export function tripUrl(tripId: string, tab?: string) {
  return tab ? `/trips/${tripId}?tab=${tab}` : `/trips/${tripId}`
}
