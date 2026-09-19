"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { generatePrep } from "@/server/prep"
import { Button } from "@/components/ui/button"

export function GeneratePrepButton({
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
      const res = await generatePrep(tripId)
      if (res.ok) {
        toast.success(
          res.source === "AI"
            ? "Prep guide ready ✨"
            : "Sample prep created — add keys for a tailored guide."
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
      {pending ? "Building…" : hasExisting ? "Regenerate prep" : "Generate prep"}
    </Button>
  )
}
