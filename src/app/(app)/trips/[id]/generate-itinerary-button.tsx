"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { generateItinerary } from "@/server/itinerary"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

/**
 * Generates (or replaces) the plan — with the safeguards the flow needs:
 *  - warns when people haven't shared preferences yet, and
 *  - confirms before replacing an existing plan, spelling out that votes reset.
 */
export function GenerateItineraryButton({
  tripId,
  hasExisting,
  planLocked,
  hasVotes,
  missing = [],
  size,
}: {
  tripId: string
  hasExisting?: boolean
  planLocked?: boolean
  hasVotes?: boolean
  /** First names of members who haven't shared preferences. */
  missing?: string[]
  size?: React.ComponentProps<typeof Button>["size"]
}) {
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()

  function run() {
    startTransition(async () => {
      const res = await generateItinerary(tripId)
      if (res.ok) {
        toast.success(
          res.source === "AI"
            ? "Your plan is ready"
            : "Sample plan created — add SerpApi & Groq keys for live data."
        )
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const needsConfirm = Boolean(hasExisting) || missing.length > 0

  const button = (
    <Button
      onClick={needsConfirm ? undefined : run}
      disabled={pending}
      size={size}
      variant={hasExisting ? "outline" : "default"}
      className="gap-2"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : hasExisting ? (
        <RefreshCw className="size-4" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {pending
        ? "Researching & planning…"
        : hasExisting
          ? "Regenerate plan"
          : "Generate plan"}
    </Button>
  )

  if (!needsConfirm) return button

  const missingText =
    missing.length > 0
      ? `${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""} ${missing.length === 1 ? "hasn't" : "haven't"} shared preferences yet, so the plan won't reflect their tastes. `
      : ""

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasExisting ? "Replace the current plan?" : "Generate without everyone?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {missingText}
            {hasExisting &&
              (planLocked
                ? "The current plan is locked and approved by everyone. A new plan resets every approval and the trip goes back to planning."
                : hasVotes
                  ? "A new plan clears the votes already cast — everyone will need to approve again."
                  : "The current plan will be replaced by a new one.")}
            {!hasExisting && "You can always regenerate once they've answered."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {hasExisting ? "Keep current plan" : "Keep waiting"}
          </AlertDialogCancel>
          <AlertDialogAction onClick={run}>
            {hasExisting ? "Replace plan" : "Generate anyway"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
