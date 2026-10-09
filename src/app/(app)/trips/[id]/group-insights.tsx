import { Users2, Utensils, BedDouble, Bus, Sparkles, Wallet } from "lucide-react"

import { Progress } from "@/components/ui/progress-lite"
import { prettifyEnum, formatMoney } from "@/lib/format"

type Pref = {
  diet: string | null
  pace: string | null
  stayTypes: string[]
  transports: string[]
  interests: string[]
  budgetPerDay: number | null
} | null

function tally(values: string[]): [string, number][] {
  const map = new Map<string, number>()
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1)
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

function CountRow({
  icon: Icon,
  title,
  entries,
  render = (k) => prettifyEnum(k),
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  entries: [string, number][]
  render?: (k: string) => string
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No responses yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.map(([k, n]) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm"
            >
              {render(k)}
              <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-brand">
                {n}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function GroupInsights({
  members,
}: {
  members: { preference: Pref }[]
}) {
  const total = members.length
  const prefs = members
    .map((m) => m.preference)
    .filter((p): p is NonNullable<Pref> => p !== null)
  const filled = prefs.length
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0

  const budgets = prefs
    .map((p) => p.budgetPerDay)
    .filter((b): b is number => typeof b === "number")
  const avgBudget =
    budgets.length > 0
      ? Math.round(budgets.reduce((a, b) => a + b, 0) / budgets.length)
      : null

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Users2 className="size-4 text-muted-foreground" />
            Preferences collected
          </p>
          <span className="text-sm text-muted-foreground">
            {filled} / {total}
          </span>
        </div>
        <Progress value={pct} className="mt-3" />
        {avgBudget !== null && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="size-4" />
            Average comfortable spend:{" "}
            <span className="font-medium text-foreground">
              {formatMoney(avgBudget)}/day
            </span>
          </p>
        )}
      </div>

      <div className="grid gap-6 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <CountRow
          icon={Utensils}
          title="Diet"
          entries={tally(prefs.map((p) => p.diet).filter((d): d is string => !!d))}
        />
        <CountRow
          icon={Sparkles}
          title="Pace"
          entries={tally(prefs.map((p) => p.pace).filter((d): d is string => !!d))}
        />
        <CountRow
          icon={BedDouble}
          title="Stay"
          entries={tally(prefs.flatMap((p) => p.stayTypes))}
          render={(k) => k}
        />
        <CountRow
          icon={Bus}
          title="Transport"
          entries={tally(prefs.flatMap((p) => p.transports))}
          render={(k) => k}
        />
        <div className="sm:col-span-2">
          <CountRow
            icon={Sparkles}
            title="Interests"
            entries={tally(prefs.flatMap((p) => p.interests))}
            render={(k) => k}
          />
        </div>
      </div>
    </div>
  )
}
