import { ArrowRight, Check, CircleDashed, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApprovalPanel } from "./approval-panel"
import { GenerateItineraryButton } from "./generate-itinerary-button"
import { ItineraryMap, type MapStop } from "./itinerary-map"
import { ItineraryView, type ItineraryData } from "./itinerary-view"
import { TabLink } from "./trip-tabs"

type Approver = React.ComponentProps<typeof ApprovalPanel>["approvers"][number]

export function ItineraryTab({
  tripId,
  itinerary,
  itineraryId,
  stops,
  stopNumbers,
  isAdmin,
  approval,
  readiness,
  viewerHasPreference,
  viewerIsVoter,
}: {
  tripId: string
  itinerary: ItineraryData | null
  itineraryId: string | null
  stops: MapStop[]
  stopNumbers: Record<string, number>
  isAdmin: boolean
  approval: {
    locked: boolean
    canApprove: boolean
    myStatus: "APPROVED" | "REJECTED" | "PENDING"
    approvers: Approver[]
  }
  readiness: { filled: number; total: number; missing: string[] }
  viewerHasPreference: boolean
  viewerIsVoter: boolean
}) {
  const hasVotes = approval.approvers.some((a) => a.status !== "PENDING")

  return (
    <div className="space-y-5 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Trip itinerary</h3>
          <p className="text-sm text-muted-foreground">
            {itinerary
              ? "Your group's day-by-day plan. Everyone votes at the bottom."
              : "A day-by-day plan built from the group's preferences and live place data."}
          </p>
        </div>
        {isAdmin && itinerary && (
          <GenerateItineraryButton
            tripId={tripId}
            hasExisting
            planLocked={approval.locked}
            hasVotes={hasVotes}
          />
        )}
      </div>

      {itinerary && itineraryId ? (
        <>
          {/* Side by side from xl; below that the map sits on top as an overview. */}
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,44%)] xl:items-start">
            <div className="order-2 min-w-0 space-y-5 xl:order-1">
              <ItineraryView
                itinerary={itinerary}
                stopNumbers={stopNumbers}
                editable={isAdmin}
              />
            </div>
            <div className="order-1 xl:sticky xl:top-[4.5rem] xl:order-2">
              <ItineraryMap stops={stops} />
            </div>
          </div>
          <ApprovalPanel
            itineraryId={itineraryId}
            locked={approval.locked}
            canApprove={approval.canApprove}
            myStatus={approval.myStatus}
            approvers={approval.approvers}
          />
        </>
      ) : (
        <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-brand">
            <Sparkles className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">No plan yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Trippo researches real places and turns everyone's preferences into a balanced day-by-day itinerary."
              : "The trip admin will generate the plan once preferences are in."}
          </p>

          {/* Readiness: who has told us how they like to travel */}
          <div className="mt-6 w-full rounded-xl border bg-card p-4 text-left">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Preferences collected</span>
              <span className="text-muted-foreground tabular-nums">
                {readiness.filled}/{readiness.total}
              </span>
            </div>
            {readiness.missing.length > 0 ? (
              <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                <CircleDashed className="mt-0.5 size-4 shrink-0" />
                Still waiting on {readiness.missing.join(", ")}.
              </p>
            ) : (
              <p className="mt-2 flex items-start gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="mt-0.5 size-4 shrink-0" />
                Everyone has shared how they like to travel.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {isAdmin && (
              <GenerateItineraryButton
                tripId={tripId}
                size="lg"
                missing={readiness.missing}
              />
            )}
            {viewerIsVoter && !viewerHasPreference && (
              <Button asChild size="lg" variant={isAdmin ? "outline" : "default"} className="gap-2">
                <TabLink tab="preferences">
                  Add my preferences
                  <ArrowRight className="size-4" />
                </TabLink>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
