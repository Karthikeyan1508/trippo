"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, X, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { setApproval } from "@/server/approvals"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function ApprovalControls({
  itineraryId,
  myStatus,
}: {
  itineraryId: string
  myStatus: "APPROVED" | "REJECTED" | "PENDING"
}) {
  const [pending, startTransition] = React.useTransition()
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const router = useRouter()

  function approve() {
    startTransition(async () => {
      const res = await setApproval(itineraryId, "APPROVED")
      if (res.ok) {
        toast.success(res.locked ? "Plan approved by everyone 🎉" : "You approved the plan")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function requestChanges() {
    startTransition(async () => {
      const res = await setApproval(itineraryId, "REJECTED", reason)
      if (res.ok) {
        toast("Change request sent to the group")
        setRejectOpen(false)
        setReason("")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button
        onClick={approve}
        disabled={pending || myStatus === "APPROVED"}
        variant={myStatus === "APPROVED" ? "outline" : "default"}
        className={
          myStatus === "APPROVED"
            ? "flex-1 gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 hover:text-emerald-600 disabled:opacity-100 dark:text-emerald-400 dark:hover:text-emerald-400"
            : "flex-1 gap-1.5"
        }
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Check className="size-4" />
        )}
        {myStatus === "APPROVED" ? "You approved" : "Approve plan"}
      </Button>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger asChild>
          <Button
            variant={myStatus === "REJECTED" ? "destructive" : "outline"}
            className="flex-1 gap-1.5"
            disabled={pending}
          >
            <X className="size-4" />
            {myStatus === "REJECTED" ? "Changes requested" : "Request changes"}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              Tell the group what should be adjusted before you approve.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Day 2 feels too packed — can we drop a stop?"
          />
          <DialogFooter>
            <Button
              onClick={requestChanges}
              disabled={pending}
              variant="destructive"
              className="gap-1.5"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Submit feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
