import { format } from "date-fns"
import { CheckCircle2 } from "lucide-react"

import { formatMoney } from "@/lib/format"
import { Progress } from "@/components/ui/progress-lite"
import { AddExpenseDialog } from "./add-expense-dialog"
import { DeleteExpenseButton, SettleButton } from "./budget-buttons"
import { expenseIcon } from "./expense-icons"

export type BudgetExpense = {
  id: string
  description: string
  amount: number
  category: string
  paidById: string
  createdById: string | null
  splitType: string
  shareCount: number
  createdAt: Date
}

export function BudgetTab({
  tripId,
  currency,
  budgetPerPerson,
  viewerId,
  viewerIsAdmin,
  viewerIsObserver,
  participants,
  names,
  expenses,
  transfers,
  myBalance,
}: {
  tripId: string
  currency: string
  budgetPerPerson: number | null
  viewerId: string
  viewerIsAdmin: boolean
  viewerIsObserver: boolean
  /** Members who share costs (observers are excluded). */
  participants: { userId: string; name: string }[]
  names: Record<string, string>
  expenses: BudgetExpense[]
  transfers: { from: string; to: string; amount: number }[]
  myBalance: number
}) {
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0)
  const perPerson = participants.length ? totalSpent / participants.length : 0
  const budgetPct = budgetPerPerson ? (perPerson / budgetPerPerson) * 100 : 0
  const over = budgetPerPerson != null && perPerson > budgetPerPerson

  return (
    <div className="space-y-5 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Shared budget</h3>
          <p className="text-sm text-muted-foreground">
            Log expenses, split them, and settle up.
          </p>
        </div>
        {!viewerIsObserver && (
          <AddExpenseDialog
            tripId={tripId}
            members={participants}
            currentUserId={viewerId}
            currency={currency}
          />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Total spent</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(totalSpent, currency)}</p>
          <p className="text-xs text-muted-foreground">
            {expenses.length} {expenses.length === 1 ? "expense" : "expenses"}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Per person</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(perPerson, currency)}</p>
          {budgetPerPerson ? (
            <>
              <Progress
                value={budgetPct}
                className={over ? "mt-2 [&>div]:bg-destructive" : "mt-2"}
              />
              <p className={`mt-1.5 text-xs ${over ? "text-destructive" : "text-muted-foreground"}`}>
                {over
                  ? `${formatMoney(perPerson - budgetPerPerson, currency)} over budget`
                  : `of ${formatMoney(budgetPerPerson, currency)} budget`}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              across {participants.length} {participants.length === 1 ? "person" : "people"}
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Your balance</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              myBalance > 0.01
                ? "text-emerald-600 dark:text-emerald-400"
                : myBalance < -0.01
                  ? "text-destructive"
                  : ""
            }`}
          >
            {myBalance > 0.01 ? "+" : ""}
            {formatMoney(myBalance, currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {myBalance > 0.01
              ? "you're owed"
              : myBalance < -0.01
                ? "you owe"
                : "all settled"}
          </p>
        </div>
      </div>

      {transfers.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-5 py-3">
            <h4 className="font-medium">Settle up</h4>
            <p className="text-xs text-muted-foreground">
              The fewest payments that clear everyone&apos;s balance.
            </p>
          </div>
          <ul className="divide-y">
            {transfers.map((t) => {
              const canSettle = viewerIsAdmin || viewerId === t.from || viewerId === t.to
              return (
                <li
                  key={`${t.from}-${t.to}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <span>
                    <span className="font-medium">{names[t.from]}</span> pays{" "}
                    <span className="font-medium">{names[t.to]}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold">{formatMoney(t.amount, currency)}</span>
                    {canSettle && (
                      <SettleButton
                        tripId={tripId}
                        fromUserId={t.from}
                        toUserId={t.to}
                        amount={t.amount}
                      />
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        expenses.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-500" />
            Everyone&apos;s settled up.
          </div>
        )
      )}

      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-3">
          <h4 className="font-medium">Expenses</h4>
        </div>
        {expenses.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No expenses yet. Add the first one.
          </p>
        ) : (
          <ul className="divide-y">
            {expenses.map((e) => {
              const Icon = expenseIcon(e.category)
              const canDelete = viewerIsAdmin || e.createdById === viewerId
              return (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Paid by {names[e.paidById] ?? "someone"} · {format(e.createdAt, "d MMM")} ·{" "}
                      {e.splitType === "EQUAL" ? "split equally" : "custom split"} ·{" "}
                      {e.shareCount} {e.shareCount === 1 ? "person" : "people"}
                    </p>
                  </div>
                  <span className="font-semibold">{formatMoney(e.amount, currency)}</span>
                  {canDelete ? <DeleteExpenseButton id={e.id} /> : <span className="size-8" />}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
