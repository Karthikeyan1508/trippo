"use client"

import * as React from "react"
import { formatDistanceToNowStrict } from "date-fns"
import { BarChart3, Check, CircleCheck, Clock, ExternalLink, ListPlus, Lock, LockOpen, Trash2, Trophy } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import type { ChatMessageDTO, PollDTO } from "@/lib/chat"
import { castVote, deletePoll, setPollClosed } from "@/server/polls"
import { addPollWinnerToPlan } from "@/server/chat"
import { Button } from "@/components/ui/button"
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
import { useChat, isObserver } from "./chat-context"
import { AddToPlanDialog, type SubmitResult } from "./chat-dialogs"
import { PersonAvatar } from "./chat-people"
import { useNow } from "./use-now"

export function PollMessage({ message }: { message: ChatMessageDTO }) {
  const poll = message.poll as PollDTO
  const { viewer, crew, patch, refresh, tripId } = useChat()
  const now = useNow()
  const [busy, startTransition] = React.useTransition()
  const [adding, setAdding] = React.useState(false)

  const observer = isObserver(viewer.role)
  const canManage = viewer.role === "ADMIN" || poll.createdById === viewer.id
  const closedNow = poll.closed || (poll.closesAt !== null && now !== null && new Date(poll.closesAt).getTime() <= now)
  const voters = crew.filter((c) => c.role !== "OBSERVER")
  const winner = poll.winners.length === 1 ? poll.options.find((o) => o.label === poll.winners[0]) : undefined
  const author = crew.find((c) => c.id === poll.createdById)

  function vote(label: string) {
    if (observer || closedNow || label === poll.myVote) return
    // Show the vote at once; the server confirms (or we put it back).
    patch(message.id, (m) => {
      const p = m.poll as PollDTO
      const options = p.options.map((o) => ({
        ...o,
        count: o.count + (o.label === label ? 1 : 0) - (o.label === p.myVote ? 1 : 0),
      }))
      return {
        ...m,
        poll: {
          ...p,
          options,
          myVote: label,
          totalVotes: p.myVote ? p.totalVotes : p.totalVotes + 1,
          votedUserIds: p.votedUserIds.includes(viewer.id) ? p.votedUserIds : [...p.votedUserIds, viewer.id],
        },
      }
    })
    startTransition(async () => {
      const res = await castVote(poll.id, label)
      if (!res.ok) {
        toast.error(res.error)
        await refresh()
      }
    })
  }

  function toggleClosed() {
    startTransition(async () => {
      const res = await setPollClosed(poll.id, !closedNow)
      if (!res.ok) toast.error(res.error)
      await refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      const res = await deletePoll(poll.id)
      if (!res.ok) toast.error(res.error)
      await refresh()
    })
  }

  const submitWinner = async (v: { dayNumber: number | null; startTime: string | null; note: string }): Promise<SubmitResult> => {
    const res = await addPollWinnerToPlan({ tripId, pollId: poll.id, dayNumber: v.dayNumber, startTime: v.startTime, note: v.note })
    if (!res.ok) return res
    toast.success(
      res.mode === "requested"
        ? "Request sent. The admin will see it in the chat."
        : res.mode === "stay_saved"
          ? "Saved as your group's stay."
          : `Added to Day ${res.dayNumber}.${res.votesReset ? " Votes on the plan were reset." : ""}`
    )
    await refresh()
    return { ok: true }
  }

  return (
    <section className="w-full max-w-md border bg-card/80 backdrop-blur" aria-label={`Poll: ${poll.question}`}>
      <header className="flex items-center gap-2 border-b px-3.5 py-1.5 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
        <BarChart3 className="size-3.5 text-brand" />
        <span>Poll</span>
        <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal">
          {closedNow ? (
            <>
              <Lock className="size-3" />
              Closed
            </>
          ) : poll.closesAt ? (
            <>
              <Clock className="size-3" />
              {now === null ? "Open" : `Closes in ${formatDistanceToNowStrict(new Date(poll.closesAt))}`}
            </>
          ) : (
            "Open"
          )}
        </span>
      </header>

      <div className="space-y-2.5 p-3.5">
        <div>
          <h4 className="leading-snug font-semibold">{poll.question}</h4>
          {author && <p className="mt-0.5 text-xs text-muted-foreground">Started by {author.name.split(" ")[0]}. Votes are private.</p>}
        </div>

        <ul className="space-y-2">
          {poll.options.map((option) => {
            const pct = poll.totalVotes ? Math.round((option.count / poll.totalVotes) * 100) : 0
            const mine = poll.myVote === option.label
            const won = closedNow && poll.winners.includes(option.label)
            return (
              <li key={option.label}>
                <button
                  type="button"
                  onClick={() => vote(option.label)}
                  disabled={observer || closedNow || busy}
                  aria-pressed={mine}
                  className={cn(
                    "relative block w-full overflow-hidden border text-left transition-colors disabled:cursor-default",
                    mine ? "border-primary" : "enabled:hover:border-foreground/30",
                    won && "border-primary bg-primary/10"
                  )}
                >
                  <span className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-500" style={{ width: `${pct}%` }} aria-hidden />
                  <span className="relative flex items-center gap-3 p-2.5">
                    {option.item?.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={option.item.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-11 shrink-0 object-cover" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {mine && <Check className="size-3.5 shrink-0 text-brand" />}
                        {won && <Trophy className="size-3.5 shrink-0 text-brand" />}
                        <span className="truncate">{option.label}</span>
                      </span>
                      {option.item?.subtitle && <span className="block truncate text-xs text-muted-foreground">{option.item.subtitle}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {option.count} · {pct}%
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ul className="flex -space-x-1.5" aria-label="Who has voted">
              {poll.votedUserIds.slice(0, 5).map((id) => (
                <li key={id} className="ring-2 ring-card">
                  <PersonAvatar person={crew.find((c) => c.id === id) ?? { name: "?", image: null }} size={20} />
                </li>
              ))}
            </ul>
            <span className="tabular-nums">
              {poll.votedUserIds.length} of {voters.length} voted
            </span>
          </div>
          {observer ? <span>Observers can watch, not vote</span> : !closedNow && !poll.myVote ? <span className="font-medium text-foreground">Tap to vote</span> : null}
        </div>

        {closedNow && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">
              {poll.winners.length === 0 ? "Closed with no votes." : poll.winners.length === 1 ? `Decided: ${poll.winners[0]}` : `Tie between ${poll.winners.join(" and ")}`}
            </p>
            {poll.winnerState?.kind === "added" ? (
              <p className="inline-flex items-center gap-1.5 bg-primary/20 px-2.5 py-1 text-xs font-medium text-brand">
                <CircleCheck className="size-3.5" />
                {poll.winnerState.dayNumber ? `In the plan, Day ${poll.winnerState.dayNumber}` : "Chosen as your stay"}
              </p>
            ) : poll.winnerState?.kind === "pending" ? (
              <p className="inline-flex items-center gap-1.5 bg-foreground/8 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <Clock className="size-3.5" />
                Waiting for the admin
              </p>
            ) : poll.canAddWinner && !observer ? (
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setAdding(true)}>
                <ListPlus className="size-3.5" />
                {viewer.role === "ADMIN" ? "Add winner to itinerary" : "Request to add the winner"}
              </Button>
            ) : null}
            {winner?.item?.link && (
              <a href={winner.item.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                <ExternalLink className="size-3" />
                Open the winner
              </a>
            )}
          </div>
        )}

        {canManage && (
          <div className="flex items-center justify-between border-t pt-2">
            <Button variant="ghost" size="sm" onClick={toggleClosed} disabled={busy} className="h-7 gap-1.5 px-2 text-xs">
              {closedNow ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
              {closedNow ? "Reopen" : "Close poll"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label="Delete poll" disabled={busy}>
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this poll?</AlertDialogTitle>
                  <AlertDialogDescription>&ldquo;{poll.question}&rdquo; and all of its votes will be removed.</AlertDialogDescription>
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
      </div>

      {adding && winner && (
        <AddToPlanDialog
          open
          onOpenChange={(open) => !open && setAdding(false)}
          name={winner.label}
          kind={(winner.item?.kind as "hotel" | "transport" | "place") ?? "place"}
          onSubmit={submitWinner}
        />
      )}
    </section>
  )
}
