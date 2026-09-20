"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { addExpense } from "@/server/budget"
import { EXPENSE_ICONS, EXPENSE_LABELS } from "./expense-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const CATEGORIES = ["FOOD", "STAY", "TRANSPORT", "ACTIVITY", "SHOPPING", "MISC"]

type Member = { userId: string; name: string }

export function AddExpenseDialog({
  tripId,
  members,
  currentUserId,
  currency,
}: {
  tripId: string
  members: Member[]
  currentUserId: string
  currency: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const [description, setDescription] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [category, setCategory] = React.useState("FOOD")
  const [paidById, setPaidById] = React.useState(currentUserId)
  const [splitType, setSplitType] = React.useState<"EQUAL" | "CUSTOM">("EQUAL")
  const [custom, setCustom] = React.useState<Record<string, string>>({})

  const total = Number(amount) || 0
  const perHead = members.length ? total / members.length : 0
  const customSum = members.reduce(
    (a, m) => a + (Number(custom[m.userId]) || 0),
    0
  )

  function reset() {
    setDescription("")
    setAmount("")
    setCategory("FOOD")
    setPaidById(currentUserId)
    setSplitType("EQUAL")
    setCustom({})
  }

  function submit() {
    startTransition(async () => {
      const res = await addExpense(tripId, {
        description,
        amount: Number(amount),
        category: category as "FOOD",
        paidById,
        splitType,
        customShares:
          splitType === "CUSTOM"
            ? members
                .map((m) => ({
                  userId: m.userId,
                  amount: Number(custom[m.userId]) || 0,
                }))
                .filter((s) => s.amount > 0)
            : undefined,
      })
      if (res.ok) {
        toast.success("Expense added")
        reset()
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" />
          Add expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an expense</DialogTitle>
          <DialogDescription>
            Log what was spent and how to split it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dinner at Britto's"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Amount ({currency})</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => {
                    const Icon = EXPENSE_ICONS[c]
                    return (
                      <SelectItem key={c} value={c}>
                        <Icon className="size-4 text-muted-foreground" />
                        {EXPENSE_LABELS[c]}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Paid by</Label>
            <Select value={paidById} onValueChange={setPaidById}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name}
                    {m.userId === currentUserId ? " (you)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Split</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["EQUAL", "CUSTOM"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSplitType(t)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors",
                    splitType === t
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {t === "EQUAL" ? "Split equally" : "Custom amounts"}
                </button>
              ))}
            </div>

            {splitType === "EQUAL" ? (
              <p className="text-sm text-muted-foreground">
                {members.length} people ·{" "}
                <span className="font-medium text-foreground">
                  {currency} {perHead.toFixed(2)}
                </span>{" "}
                each
              </p>
            ) : (
              <div className="space-y-2 rounded-lg border p-3">
                {members.map((m) => (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm">
                      {m.name}
                      {m.userId === currentUserId ? " (you)" : ""}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={custom[m.userId] ?? ""}
                      onChange={(e) =>
                        setCustom((prev) => ({
                          ...prev,
                          [m.userId]: e.target.value,
                        }))
                      }
                      placeholder="0"
                      className="h-8 w-24"
                    />
                  </div>
                ))}
                <p
                  className={cn(
                    "text-right text-xs",
                    Math.abs(customSum - total) > 0.5
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  Shares: {currency} {customSum.toFixed(2)} / {total.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={pending} className="gap-2">
            {pending && <Loader2 className="size-4 animate-spin" />}
            Add expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
