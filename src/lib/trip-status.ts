import { tripPhase } from "@/lib/journey"

export const STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planning",
  VOTING: "Voting",
  CONFIRMED: "Confirmed",
  ACTIVE: "On trip",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
}

/**
 * The stored status only tracks the planning lifecycle (planning → voting →
 * confirmed). Once the dates arrive the calendar takes over, so the label a
 * person sees is "On trip" / "Completed" without anyone having to flip it.
 */
export function effectiveStatus(status: string, start: Date, end: Date) {
  if (status === "ARCHIVED") return status
  const { phase } = tripPhase(start, end)
  if (phase === "ongoing") return "ACTIVE"
  if (phase === "past") return "COMPLETED"
  return status
}
