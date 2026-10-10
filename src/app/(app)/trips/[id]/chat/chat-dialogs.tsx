"use client"

import * as React from "react"
import { BarChart3, ListPlus, Loader2, Plus, ShieldCheck, X } from "lucide-react"
import { cn } from "cn"

import type { ChatCard } from "@/lib/chat"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useChat } from "./chat-context"

/*
 * Each dialog keeps its form inside the dialog's content. Radix unmounts the content when the
 * dialog closes, so every opening starts from a clean form with no reset code.
 */

export type SubmitResult = { ok: true } | { ok: false; error: string }

const CLOSES: { value: string; label: string }[] = [
  { value: "60", label: "1 hour" },
  { value: "360", label: "6 hours" },
  { value: "1440", label: "1 day" },
  { value: "4320", label: "3 days" },
  { value: "0", label: "No deadline" },
]

function ClosesSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>Voting closes in</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CLOSES.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ── Add to the itinerary ────────────────────────────────────────────────

type AddProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  kind: "hotel" | "transport" | "place"
  defaultDay?: number
  defaultTime?: string
  onSubmit: (value: { dayNumber: number | null; startTime: string | null; note: string }) => Promise<SubmitResult>
}

/**
 * "Add to itinerary". Pick the day (and optionally a time). For an admin it goes straight in;
 * for anyone else it is sent to the admins as a request, and the wording says which.
 */
export function AddToPlanDialog(props: AddProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <AddToPlanBody {...props} />
      </DialogContent>
    </Dialog>
  )
}

function AddToPlanBody({ onOpenChange, name, kind, defaultDay = 1, defaultTime = "", onSubmit }: AddProps) {
  const { viewer, planDays } = useChat()
  const admin = viewer.role === "ADMIN"
  const startDay = planDays.some((d) => d.dayNumber === defaultDay) ? defaultDay : (planDays[0]?.dayNumber ?? 1)
  const [day, setDay] = React.useState(String(startDay))
  const [time, setTime] = React.useState(defaultTime)
  const [note, setNote] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const noPlan = planDays.length === 0
  const savesStay = noPlan && kind === "hotel"

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await onSubmit({ dayNumber: noPlan ? null : Number(day), startTime: time || null, note })
      if (res.ok) onOpenChange(false)
      else setError(res.error)
    })
  }

  return (
    <>
      <DialogHeader>
        <div className="mb-1 grid size-10 place-items-center bg-primary/20 text-brand">
          {admin ? <ListPlus className="size-5" /> : <ShieldCheck className="size-5" />}
        </div>
        <DialogTitle>{savesStay ? "Choose this as your stay" : admin ? "Add to itinerary" : "Ask the admin to add this"}</DialogTitle>
        <DialogDescription className="text-left leading-relaxed">
          <span className="font-medium text-foreground">{name}</span>
          <br />
          {savesStay
            ? "There is no itinerary yet, so this becomes the group's stay and the plan is built around it."
            : noPlan
              ? "There is no itinerary yet. Generate the plan first, then add this to a day."
              : admin
                ? "It goes straight into the plan. Votes on the plan are reset so everyone can look again."
                : "Only the trip admin can change the plan, so this goes to them as a request. You will hear back here in the chat."}
        </DialogDescription>
      </DialogHeader>

      {!noPlan && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-2">
              <Label>Day</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {planDays.map((d) => (
                    <SelectItem key={d.dayNumber} value={String(d.dayNumber)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-time">Time (optional)</Label>
              <Input id="add-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-note">Note (optional)</Label>
            <Textarea
              id="add-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder={admin ? "Why this one?" : "Tell the admin why it fits"}
              className="min-h-14"
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || (noPlan && kind !== "hotel")} className="gap-2">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {savesStay ? "Choose this stay" : admin ? "Add to itinerary" : "Send request"}
        </Button>
      </DialogFooter>
    </>
  )
}

// ── Start a poll from an AI card ────────────────────────────────────────

const itemLabel = (item: ChatCard["items"][number]): string => ("name" in item ? item.name : item.title)

type StartPollProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  card: ChatCard
  initialKeys: string[]
  onSubmit: (value: { itemKeys: string[]; question: string; closesInMinutes: number | null }) => Promise<SubmitResult>
}

export function StartPollDialog(props: StartPollProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <StartPollBody {...props} />
      </DialogContent>
    </Dialog>
  )
}

function StartPollBody({ onOpenChange, card, initialKeys, onSubmit }: StartPollProps) {
  const [keys, setKeys] = React.useState<string[]>(initialKeys)
  const [question, setQuestion] = React.useState("")
  const [closes, setCloses] = React.useState("1440")
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const placeholder =
    card.type === "hotels"
      ? `Where should we stay${card.area ? ` near ${card.area}` : ""}?`
      : card.type === "transport"
        ? `How should we get from ${card.from} to ${card.to}?`
        : "Which should we do?"

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await onSubmit({ itemKeys: keys, question: question.trim() || placeholder, closesInMinutes: Number(closes) || null })
      if (res.ok) onOpenChange(false)
      else setError(res.error)
    })
  }

  return (
    <>
      <DialogHeader>
        <div className="mb-1 grid size-10 place-items-center bg-primary/20 text-brand">
          <BarChart3 className="size-5" />
        </div>
        <DialogTitle>Start a poll</DialogTitle>
        <DialogDescription className="text-left">The crew votes right here in the chat, and everyone gets a notification.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="poll-q">Question</Label>
          <Input id="poll-q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={placeholder} maxLength={160} />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Options ({keys.length} chosen)</legend>
          <ul className="max-h-52 space-y-1 overflow-y-auto border p-2">
            {card.items.map((item) => {
              const checked = keys.includes(item.key)
              return (
                <li key={item.key}>
                  <label className={cn("flex cursor-pointer items-center gap-3 px-2 py-1.5 text-sm hover:bg-foreground/5", checked && "bg-primary/10")}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => setKeys((prev) => (next ? [...prev, item.key] : prev.filter((k) => k !== item.key)))}
                    />
                    <span className="min-w-0 flex-1 truncate">{itemLabel(item)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>

        <ClosesSelect value={closes} onChange={setCloses} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || keys.length < 2} className="gap-2">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Start poll
        </Button>
      </DialogFooter>
    </>
  )
}

// ── A poll written by hand, from the composer ───────────────────────────

const MAX_OPTIONS = 6

type NewPollProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialQuestion?: string
  onSubmit: (value: { question: string; options: string[]; closesInMinutes: number | null }) => Promise<SubmitResult>
}

export function NewPollDialog(props: NewPollProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <NewPollBody {...props} />
      </DialogContent>
    </Dialog>
  )
}

function NewPollBody({ onOpenChange, initialQuestion = "", onSubmit }: NewPollProps) {
  const [question, setQuestion] = React.useState(initialQuestion)
  const [options, setOptions] = React.useState(["", ""])
  const [closes, setCloses] = React.useState("1440")
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  const filled = options.filter((o) => o.trim()).length

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await onSubmit({ question, options, closesInMinutes: Number(closes) || null })
      if (res.ok) onOpenChange(false)
      else setError(res.error)
    })
  }

  return (
    <>
      <DialogHeader>
        <div className="mb-1 grid size-10 place-items-center bg-primary/20 text-brand">
          <BarChart3 className="size-5" />
        </div>
        <DialogTitle>Put a question to the crew</DialogTitle>
        <DialogDescription className="text-left">Everyone gets one vote and can change it until the poll closes.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="np-q">Question</Label>
          <Input id="np-q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Beach or hills for day 2?" maxLength={160} autoFocus />
        </div>
        <div className="space-y-2">
          <Label>Choices</Label>
          {options.map((option, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={option}
                onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                placeholder={`Choice ${i + 1}`}
                maxLength={80}
                aria-label={`Choice ${i + 1}`}
              />
              {options.length > 2 && (
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove choice ${i + 1}`} onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setOptions((prev) => [...prev, ""])}>
              <Plus className="size-4" />
              Add a choice
            </Button>
          )}
        </div>
        <ClosesSelect value={closes} onChange={setCloses} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || question.trim().length < 3 || filled < 2} className="gap-2">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Start poll
        </Button>
      </DialogFooter>
    </>
  )
}
