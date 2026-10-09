"use client"

import * as React from "react"
import {
  ArrowRight,
  Check,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  Trophy,
  Vote,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { castVote, createPoll, deletePoll, setPollClosed } from "@/server/polls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress-lite"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { TabLink } from "./trip-tabs"

export type PollData = {
  id: string
  question: string
  options: string[]
  votes: { userId: string; option: string }[]
  closed: boolean
  createdById: string
}

export type PlanApprovalSummary = {
  hasPlan: boolean
  locked: boolean
  approved: number
  total: number
  myStatus: "APPROVED" | "REJECTED" | "PENDING"
}

const STARTERS = [
  "Where should we stay?",
  "Beach or hills for day 2?",
  "Which night is the big dinner?",
  "Rent bikes or take cabs?",
]

const MAX_OPTIONS = 8

function NewPollDialog({
  tripId,
  trigger,
  initialQuestion = "",
}: {
  tripId: string
  trigger: React.ReactNode
  initialQuestion?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [question, setQuestion] = React.useState(initialQuestion)
  const [options, setOptions] = React.useState(["", ""])

  function setOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
  }

  function submit() {
    startTransition(async () => {
      const res = await createPoll(tripId, question, options)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Decision opened for voting")
      setQuestion("")
      setOptions(["", ""])
      setOpen(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setQuestion(initialQuestion)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Put a question to the group</DialogTitle>
          <DialogDescription>
            Everyone gets one vote and can change it until the poll is closed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="poll-question">Question</Label>
            <Input
              id="poll-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Where should we stay?"
              maxLength={160}
            />
          </div>

          <div className="space-y-2">
            <Label>Choices</Label>
            {options.map((option, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={option}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Choice ${i + 1}`}
                  maxLength={80}
                  aria-label={`Choice ${i + 1}`}
                />
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove choice ${i + 1}`}
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setOptions((prev) => [...prev, ""])}
              >
                <Plus className="size-4" />
                Add a choice
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Opening…" : "Open for voting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PollCard({
  poll,
  viewerId,
  viewerIsAdmin,
  canVote,
  voterCount,
}: {
  poll: PollData
  viewerId: string
  viewerIsAdmin: boolean
  canVote: boolean
  voterCount: number
}) {
  const [busy, startTransition] = React.useTransition()
  const total = poll.votes.length
  const mine = poll.votes.find((v) => v.userId === viewerId)?.option
  const canManage = viewerIsAdmin || poll.createdById === viewerId

  const counts = poll.options.map((option) => ({
    option,
    count: poll.votes.filter((v) => v.option === option).length,
  }))
  const top = Math.max(0, ...counts.map((c) => c.count))
  const leaders = top > 0 ? counts.filter((c) => c.count === top) : []

  function vote(option: string) {
    startTransition(async () => {
      const res = await castVote(poll.id, option)
      if (!res.ok) toast.error(res.error)
    })
  }

  function toggleClosed() {
    startTransition(async () => {
      const res = await setPollClosed(poll.id, !poll.closed)
      if (!res.ok) toast.error(res.error)
    })
  }

  function remove() {
    startTransition(async () => {
      const res = await deletePoll(poll.id)
      if (!res.ok) toast.error(res.error)
    })
  }

  return (
    <section className="flex flex-col rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium">{poll.question}</h4>
        <Badge variant={poll.closed ? "secondary" : "outline"} className="shrink-0 gap-1">
          {poll.closed ? <Lock className="size-3" /> : <Vote className="size-3" />}
          {poll.closed ? "Closed" : "Open"}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {total} of {voterCount} voted · votes are anonymous
      </p>

      <div className="mt-4 flex-1 space-y-2.5">
        {counts.map(({ option, count }) => {
          const pct = total ? Math.round((count / total) * 100) : 0
          const selected = mine === option
          const isLeader = poll.closed && leaders.some((l) => l.option === option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => canVote && !poll.closed && vote(option)}
              disabled={!canVote || poll.closed || busy}
              className={cn(
                "w-full rounded-xl border p-3 text-left transition-colors disabled:cursor-default",
                selected ? "border-primary bg-primary/5" : "enabled:hover:bg-muted/50",
                isLeader && "border-emerald-500/50 bg-emerald-500/5"
              )}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  {selected && <Check className="size-4 text-brand" />}
                  {isLeader && <Trophy className="size-4 text-emerald-600" />}
                  {option}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {count} · {pct}%
                </span>
              </div>
              <Progress value={pct} className="mt-2 h-1.5" />
            </button>
          )
        })}
      </div>

      {poll.closed && (
        <p className="mt-3 text-sm font-medium">
          {leaders.length === 0
            ? "Closed with no votes."
            : leaders.length === 1
              ? `Decided: ${leaders[0].option}`
              : `Tie between ${leaders.map((l) => l.option).join(" and ")}`}
        </p>
      )}

      {canManage && (
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <Button variant="ghost" size="sm" onClick={toggleClosed} disabled={busy} className="gap-1.5">
            {poll.closed ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            {poll.closed ? "Reopen" : "Close voting"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label="Delete poll"
                disabled={busy}
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this poll?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{poll.question}” and all of its votes will be removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={remove}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </section>
  )
}

function ApprovalSummary({ approval }: { approval: PlanApprovalSummary }) {
  const pct = approval.total ? Math.round((approval.approved / approval.total) * 100) : 0
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand">
        {approval.locked ? <Lock className="size-5" /> : <Vote className="size-5" />}
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <h4 className="font-medium">Itinerary approval</h4>
        {approval.hasPlan ? (
          <>
            <p className="text-sm text-muted-foreground">
              {approval.locked
                ? "Everyone approved. The plan is locked in."
                : `${approval.approved} of ${approval.total} have approved.`}
            </p>
            <Progress value={pct} className="mt-2 h-1.5" />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Voting opens once the plan has been generated.
          </p>
        )}
      </div>
      {approval.hasPlan && !approval.locked && (
        <Button asChild variant={approval.myStatus === "PENDING" ? "default" : "outline"} className="gap-2">
          <TabLink tab="itinerary">
            {approval.myStatus === "PENDING" ? "Review & vote" : "View plan"}
            <ArrowRight className="size-4" />
          </TabLink>
        </Button>
      )}
    </section>
  )
}

export function PollsPanel({
  tripId,
  polls,
  viewerId,
  viewerIsAdmin,
  canVote,
  voterCount,
  approval,
}: {
  tripId: string
  polls: PollData[]
  viewerId: string
  viewerIsAdmin: boolean
  canVote: boolean
  voterCount: number
  approval: PlanApprovalSummary
}) {
  return (
    <div className="space-y-5 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Decisions</h3>
          <p className="text-sm text-muted-foreground">
            Settle the trade-offs before they turn into itinerary arguments.
          </p>
        </div>
        {canVote && (
          <NewPollDialog
            tripId={tripId}
            trigger={
              <Button className="gap-2">
                <Plus className="size-4" />
                New decision
              </Button>
            }
          />
        )}
      </div>

      <ApprovalSummary approval={approval} />

      {polls.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-xl bg-primary/10 text-brand">
            <Vote className="size-5" />
          </div>
          <p className="mt-4 font-medium">No open questions</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            When the group can&apos;t agree on where to stay or how to get around, put it
            to a vote.
          </p>
          {canVote && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {STARTERS.map((q) => (
                <NewPollDialog
                  key={q}
                  tripId={tripId}
                  initialQuestion={q}
                  trigger={
                    <Button variant="outline" size="sm" className="rounded-full">
                      {q}
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {polls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              viewerId={viewerId}
              viewerIsAdmin={viewerIsAdmin}
              canVote={canVote}
              voterCount={voterCount}
            />
          ))}
        </div>
      )}
    </div>
  )
}
