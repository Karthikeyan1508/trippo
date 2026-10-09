"use client"

import * as React from "react"
import { Loader2, LogOut, UserMinus } from "lucide-react"
import { toast } from "sonner"

import { leaveTrip, removeMember, updateMemberRole } from "@/server/trips"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Role = "ADMIN" | "MEMBER" | "OBSERVER"

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "OBSERVER", label: "Observer" },
]

/** Per-person controls on the Crew tab. Rendering is gated server-side too. */
export function MemberActions({
  tripId,
  memberId,
  name,
  role,
  isSelf,
  viewerIsAdmin,
}: {
  tripId: string
  memberId: string
  name: string
  role: Role
  isSelf: boolean
  viewerIsAdmin: boolean
}) {
  const [pending, startTransition] = React.useTransition()

  function changeRole(next: string) {
    startTransition(async () => {
      const res = await updateMemberRole(tripId, memberId, next as Role)
      if (res.ok) toast.success(`${name} is now ${next.toLowerCase()}`)
      else toast.error(res.error)
    })
  }

  function remove() {
    startTransition(async () => {
      const res = await removeMember(tripId, memberId)
      if (res.ok) toast.success(`${name} was removed from the trip`)
      else toast.error(res.error)
    })
  }

  function leave() {
    startTransition(async () => {
      const res = await leaveTrip(tripId)
      // On success the action redirects to the dashboard.
      if (res && !res.ok) toast.error(res.error)
    })
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {viewerIsAdmin && (
        <Select value={role} onValueChange={changeRole} disabled={pending}>
          <SelectTrigger size="sm" className="w-32" aria-label={`Role for ${name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {viewerIsAdmin && !isSelf && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${name}`}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <UserMinus className="size-4" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
              <AlertDialogDescription>
                They lose access to this trip, and their preferences, checklist and
                votes are cleared. They can rejoin with the invite link.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={remove}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isSelf && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" disabled={pending}>
              <LogOut className="size-4" />
              Leave
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave this trip?</AlertDialogTitle>
              <AlertDialogDescription>
                Your preferences, checklist and votes will be cleared. You can rejoin
                later with the invite link.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={leave}>
                Leave trip
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
