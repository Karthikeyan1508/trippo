"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { toggleChecklistItem, addChecklistItem } from "@/server/prep"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress-lite"

type Item = { id: string; label: string; category: string; isDone: boolean }

const CATEGORY_LABEL: Record<string, string> = {
  DOCUMENT: "Documents",
  PACKING: "Packing",
  BOOKING: "Bookings",
  GEAR: "Gear",
  OTHER: "Other",
}
const CATEGORY_ORDER = ["DOCUMENT", "BOOKING", "PACKING", "GEAR", "OTHER"]

export function Checklist({
  tripId,
  items,
}: {
  tripId: string
  items: Item[]
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [local, setLocal] = React.useState(items)
  const [newLabel, setNewLabel] = React.useState("")

  React.useEffect(() => setLocal(items), [items])

  const done = local.filter((i) => i.isDone).length
  const pct = local.length ? Math.round((done / local.length) * 100) : 0

  function toggle(id: string) {
    setLocal((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isDone: !i.isDone } : i))
    )
    startTransition(async () => {
      const res = await toggleChecklistItem(id)
      if (!res.ok) {
        toast.error(res.error)
        setLocal(items)
      }
    })
  }

  function add(e: React.FormEvent) {
    e.preventDefault()
    const label = newLabel.trim()
    if (!label) return
    startTransition(async () => {
      const res = await addChecklistItem(tripId, label)
      if (res.ok) {
        setNewLabel("")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: local.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">My checklist</h3>
        <span className="text-sm text-muted-foreground">
          {done} / {local.length} done
        </span>
      </div>
      <Progress value={pct} className="mt-3" />

      <div className="mt-4 space-y-5">
        {groups.map((g) => (
          <div key={g.cat}>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {CATEGORY_LABEL[g.cat] ?? g.cat}
            </p>
            <ul className="space-y-1.5">
              {g.items.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-muted">
                    <Checkbox
                      checked={item.isDone}
                      onCheckedChange={() => toggle(item.id)}
                    />
                    <span
                      className={cn(
                        "text-sm",
                        item.isDone && "text-muted-foreground line-through"
                      )}
                    >
                      {item.label}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="mt-5 flex gap-2 border-t pt-4">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Add your own item…"
          className="h-9"
        />
        <Button type="submit" size="icon" variant="outline" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
        </Button>
      </form>
    </div>
  )
}
