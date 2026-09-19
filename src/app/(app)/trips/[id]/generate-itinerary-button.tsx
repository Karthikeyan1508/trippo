"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { generateItinerary } from "@/server/itinerary"
import { Button } from "@/components/ui/button"

export function GenerateItineraryButton({
  tripId,
  hasExisting,
}: {
  tripId: string
  hasExisting?: boolean
}) {
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()

  function run() {
    startTransition(async () => {
      const res = await generateItinerary(tripId)
      if (res.ok) {
        toast.success(
          res.source === "AI"
            ? "Itinerary generated ✨"
            : "Sample plan created — add SerpApi & Groq keys for live data."
        )
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Button onClick={run} disabled={pending} className="gap-2">
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : hasExisting ? (
        <RefreshCw className="size-4" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {pending
        ? "Building plan…"
        : hasExisting
          ? "Regenerate plan"
          : "Generate plan"}
    </Button>
  )
}
