"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2, Check, X, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { recordSettlement, deleteExpense, reviewExpenseEdit } from "@/server/budget"
import { Button } from "@/components/ui/button"

export function SettleButton({
  tripId,
  fromUserId,
  toUserId,
  amount,
}: {
  tripId: string
  fromUserId: string
  toUserId: string
  amount: number
}) {
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      className="gap-1.5"
      onClick={() =>
        startTransition(async () => {
          const res = await recordSettlement(tripId, fromUserId, toUserId, amount)
          if (res.ok) {
            toast.success("Marked as settled")
            router.refresh()
          } else {
            toast.error(res.error)
          }
        })
      }
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Check className="size-3.5" />
      )}
      Settle
    </Button>
  )
}

export function ReviewExpenseEditButtons({ id }: { id: string }) {
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()
  const review = (approved: boolean) => startTransition(async () => {
    const res = await reviewExpenseEdit(id, approved)
    if (res.ok) {
      toast.success(approved ? "Expense edit approved" : "Expense edit rejected")
      router.refresh()
    } else toast.error(res.error)
  })
  return (
    <span className="flex items-center gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => review(false)} aria-label="Reject expense edit">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
      </Button>
      <Button size="sm" disabled={pending} onClick={() => review(true)} className="gap-1.5">
        <Check className="size-3.5" /> Approve
      </Button>
    </span>
  )
}

export function DeleteExpenseButton({ id }: { id: string }) {
  const [pending, startTransition] = React.useTransition()
  const router = useRouter()
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label="Delete expense"
      className="size-8 text-muted-foreground hover:text-destructive"
      onClick={() =>
        startTransition(async () => {
          const res = await deleteExpense(id)
          if (res.ok) router.refresh()
          else toast.error(res.error)
        })
      }
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
    </Button>
  )
}
