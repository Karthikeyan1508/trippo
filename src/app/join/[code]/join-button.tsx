"use client"

import * as React from "react"
import { Loader2, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { joinTrip } from "@/server/trips"
import { Button } from "@/components/ui/button"

/** Joins the trip, then the server redirects to the preferences step. */
export function JoinButton({ code }: { code: string }) {
  const [pending, startTransition] = React.useTransition()

  function join() {
    startTransition(async () => {
      const res = await joinTrip(code)
      // On success the action redirects; we only get here on failure.
      if (res && !res.ok) toast.error(res.error)
    })
  }

  return (
    <Button size="lg" className="h-12 w-full gap-2 text-base" onClick={join} disabled={pending}>
      {pending ? <Loader2 className="size-5 animate-spin" /> : <UserPlus className="size-5" />}
      Join this trip
    </Button>
  )
}
