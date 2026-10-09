"use client"

import * as React from "react"
import { HardDrive, Loader2, LogOut } from "lucide-react"
import { toast } from "sonner"

import { clearOfflineData } from "@/lib/offline"
import { signOutAction } from "@/server/auth-actions"
import { Button } from "@/components/ui/button"

/** Removes the trip pages this browser saved for offline use. */
export function ClearOfflineButton() {
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      variant="outline"
      className="gap-2"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await clearOfflineData()
          toast.success("Offline data cleared from this device")
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <HardDrive className="size-4" />}
      Clear offline data
    </Button>
  )
}

export function SignOutButton() {
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      variant="destructive"
      className="gap-2"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await clearOfflineData()
          await signOutAction()
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
      Sign out
    </Button>
  )
}
