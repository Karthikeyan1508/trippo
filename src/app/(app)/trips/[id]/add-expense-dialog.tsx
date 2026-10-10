"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { addExpense, convertExpenseAmount, requestExpenseEdit } from "@/server/budget"
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
type ExistingExpense = {
  id: string
  description: string
  amount: number
  category: string
  paidById: string
  splitType: string
  shares: { userId: string; amount: number }[]
  localAmount: number | null
  localCurrency: string | null
  exchangeRate: number | null
  exchangeRateAsOf: string | null
}

export function AddExpenseDialog({
  tripId,
  members,
  currentUserId,
  currency,
  expense,
}: {
  tripId: string
  members: Member[]
  currentUserId: string
  currency: string
  expense?: ExistingExpense
}) {
  const isEdit = !!expense
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [converting, startConverting] = React.useTransition()

  const [description, setDescription] = React.useState(expense?.description ?? "")
  const [amount, setAmount] = React.useState(expense ? String(expense.amount) : "")
  const [localAmount, setLocalAmount] = React.useState(expense?.localAmount != null ? String(expense.localAmount) : expense ? String(expense.amount) : "")
  const [localCurrency, setLocalCurrency] = React.useState(expense?.localCurrency ?? currency)
  const [exchangeRate, setExchangeRate] = React.useState(expense?.exchangeRate ?? 1)
  const [exchangeRateAsOf, setExchangeRateAsOf] = React.useState(expense?.exchangeRateAsOf ?? "")
  const [category, setCategory] = React.useState(expense?.category ?? "FOOD")
  const [paidById, setPaidById] = React.useState(expense?.paidById ?? currentUserId)
  const [splitType, setSplitType] = React.useState<"EQUAL" | "CUSTOM">(
    expense?.splitType === "CUSTOM" ? "CUSTOM" : "EQUAL"
  )
  const [custom, setCustom] = React.useState<Record<string, string>>(
    Object.fromEntries(expense?.shares.map((share) => [share.userId, String(share.amount)]) ?? [])
  )

  const total = Number(amount) || 0
  const perHead = members.length ? total / members.length : 0
  const customSum = members.reduce(
    (a, m) => a + (Number(custom[m.userId]) || 0),
    0
  )

  function reset() {
    setDescription(expense?.description ?? "")
    setAmount(expense ? String(expense.amount) : "")
    setLocalAmount(expense?.localAmount != null ? String(expense.localAmount) : expense ? String(expense.amount) : "")
    setLocalCurrency(expense?.localCurrency ?? currency)
    setExchangeRate(expense?.exchangeRate ?? 1)
    setExchangeRateAsOf(expense?.exchangeRateAsOf ?? "")
    setCategory(expense?.category ?? "FOOD")
    setPaidById(expense?.paidById ?? currentUserId)
    setSplitType(expense?.splitType === "CUSTOM" ? "CUSTOM" : "EQUAL")
    setCustom(Object.fromEntries(expense?.shares.map((share) => [share.userId, String(share.amount)]) ?? []))
  }

  function updateLocalAmount(value: string) {
    setLocalAmount(value)
    if (localCurrency === currency) {
      setAmount(value)
      setExchangeRate(1)
      setExchangeRateAsOf("")
    } else {
      setAmount("")
      setExchangeRate(0)
      setExchangeRateAsOf("")
    }
  }

  function convert() {
    startConverting(async () => {
      const res = await convertExpenseAmount(tripId, Number(localAmount), localCurrency)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setAmount(String(res.data.amount))
      setExchangeRate(res.data.rate)
      setExchangeRateAsOf(res.data.asOf ?? "")
    })
  }

  function submit() {
    startTransition(async () => {
      const input = {
        description,
        amount: Number(amount),
        localAmount: Number(localAmount),
        localCurrency,
        exchangeRate,
        exchangeRateAsOf: exchangeRateAsOf || undefined,
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
      }
      const res = expense
        ? await requestExpenseEdit(expense.id, input)
        : await addExpense(tripId, input)
      if (res.ok) {
        toast.success(expense ? "Edit sent to admin for approval" : "Expense added")
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
          {isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {isEdit ? "Edit" : "Add expense"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit expense" : "Add an expense"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Your changes will be published after an admin approves them." : "Log what was spent and how to split it."}
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
              <Label>Spent locally</Label>
              <Input
                type="number"
                min={0}
                value={localAmount}
                onChange={(e) => updateLocalAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Local currency</Label>
              <Input
                value={localCurrency}
                maxLength={3}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase()
                  setLocalCurrency(next)
                  setAmount(next === currency ? localAmount : "")
                  setExchangeRate(next === currency ? 1 : 0)
                  setExchangeRateAsOf("")
                }}
                placeholder="THB"
              />
            </div>
          </div>
          <div className="flex items-end gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Split total ({currency})</p>
              <p className="font-medium tabular-nums">{amount ? `${currency} ${Number(amount).toFixed(2)}` : "Convert local amount first"}</p>
              {exchangeRateAsOf && <p className="truncate text-xs text-muted-foreground">Rate captured {exchangeRateAsOf}</p>}
            </div>
            <Button type="button" variant="outline" onClick={convert} disabled={converting || !localAmount || localCurrency === currency}>
              {converting && <Loader2 className="size-4 animate-spin" />}
              Convert
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
                      ? "border-primary bg-primary/10 font-medium text-brand"
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
          <Button onClick={submit} disabled={pending || converting || !amount || !exchangeRate} className="gap-2">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Send for approval" : "Add expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
