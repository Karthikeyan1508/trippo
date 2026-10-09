"use client"

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import {
  addStop,
  moveStop,
  removeStop,
  updateStop,
  type StopInput,
} from "@/server/itinerary-edit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const CATEGORIES = [
  { value: "ACTIVITY", label: "Activity" },
  { value: "FOOD", label: "Food & drink" },
  { value: "STAY", label: "Stay" },
  { value: "TRAVEL", label: "Travel" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "EVENT", label: "Event" },
  { value: "OTHER", label: "Other" },
]

type Mode =
  | { kind: "add"; dayId: string }
  | { kind: "edit"; itemId: string; initial: StopInput }

/** Add or edit a stop. Controlled by the caller so a menu item can open it. */
function StopDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: Mode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode.kind === "add" ? "Add a stop" : "Edit stop"}</DialogTitle>
          <DialogDescription>
            Changing the plan clears the group&apos;s votes. Custom stops
            don&apos;t appear on the map.
          </DialogDescription>
        </DialogHeader>
        {/* Content unmounts when closed, so the form always starts fresh. */}
        <StopForm mode={mode} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function StopForm({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const [pending, startTransition] = React.useTransition()
  const [form, setForm] = React.useState<StopInput>(
    mode.kind === "edit"
      ? mode.initial
      : { title: "", startTime: "", category: "ACTIVITY", description: "" }
  )
  const set = (patch: Partial<StopInput>) => setForm((f) => ({ ...f, ...patch }))

  function submit() {
    startTransition(async () => {
      const res =
        mode.kind === "add"
          ? await addStop(mode.dayId, form)
          : await updateStop(mode.itemId, form)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.votesReset
          ? "Plan updated. Votes were reset, so everyone needs to approve again."
          : "Plan updated"
      )
      onDone()
    })
  }

  return (
    <>
      <form
        id="stop-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="stop-title">What&apos;s happening?</Label>
          <Input
            id="stop-title"
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Sunset at the lighthouse"
            maxLength={120}
            autoFocus
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="stop-time">Time</Label>
            <Input
              id="stop-time"
              type="time"
              value={form.startTime ?? ""}
              onChange={(e) => set({ startTime: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.category} onValueChange={(v) => set({ category: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stop-notes">Notes (optional)</Label>
          <Textarea
            id="stop-notes"
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => set({ description: e.target.value })}
            maxLength={300}
          />
        </div>
      </form>

      <DialogFooter>
        <Button type="submit" form="stop-form" disabled={pending} className="gap-2">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {mode.kind === "add" ? "Add stop" : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  )
}

/** "Add a stop" button at the bottom of each day. */
export function AddStopButton({ dayId }: { dayId: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        Add a stop
      </Button>
      <StopDialog mode={{ kind: "add", dayId }} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** ⋯ menu on each stop: edit, reorder, remove. */
export function StopMenu({
  itemId,
  title,
  isFirst,
  isLast,
  initial,
}: {
  itemId: string
  title: string
  isFirst: boolean
  isLast: boolean
  initial: StopInput
}) {
  const [editing, setEditing] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  function run(action: () => ReturnType<typeof removeStop>, done?: string) {
    startTransition(async () => {
      const res = await action()
      if (!res.ok) toast.error(res.error)
      else if (res.votesReset) toast.success("Votes were reset. The plan changed.")
      else if (done) toast.success(done)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={`Edit ${title}`}
            disabled={pending}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isFirst} onSelect={() => run(() => moveStop(itemId, "up"))}>
            <ArrowUp className="size-4" />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isLast} onSelect={() => run(() => moveStop(itemId, "down"))}>
            <ArrowDown className="size-4" />
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => run(() => removeStop(itemId), "Stop removed")}
          >
            <Trash2 className="size-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StopDialog
        mode={{ kind: "edit", itemId, initial }}
        open={editing}
        onOpenChange={setEditing}
      />
    </>
  )
}
