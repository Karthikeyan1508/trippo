"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2, Check, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { recordSettlement, deleteExpense } from "@/server/budget"
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
