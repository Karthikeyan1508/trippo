"use client"

import * as React from "react"
import { X } from "lucide-react"
import { toast } from "sonner"

import { revokeInvite } from "@/server/trips"
import { Button } from "@/components/ui/button"

export function RevokeInviteButton({
  tripId,
  inviteId,
}: {
  tripId: string
  inviteId: string
}) {
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label="Revoke invite"
      onClick={() =>
        startTransition(async () => {
          const res = await revokeInvite(tripId, inviteId)
          if (!res.ok) toast.error(res.error)
        })
      }
    >
      <X className="size-4" />
    </Button>
  )
}
