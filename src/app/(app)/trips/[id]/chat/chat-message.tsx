"use client"

import * as React from "react"
import { format } from "date-fns"
import {
  CircleCheck,
  CircleX,
  CornerUpLeft,
  Hotel,
  Info,
  ListPlus,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Trophy,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import type { AiPayload, ChatMessageDTO, NoticePayload, RequestDTO } from "@/lib/chat"
import { decideRequest, deleteChatMessage, retryTrippo } from "@/server/chat"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AiCards } from "./chat-cards"
import { useChat } from "./chat-context"
import { PersonAvatar, TrippoAvatar } from "./chat-people"
import { PollMessage } from "./chat-poll"
import { RichText } from "./rich-text"
import { useTouch } from "./use-now"

const clock = (iso: string) => format(new Date(iso), "h:mm a")

/** A quote of the message being replied to. Tapping it jumps there. */
function ReplyQuote({ replyTo, own }: { replyTo: NonNullable<ChatMessageDTO["replyTo"]>; own: boolean }) {
  const { jumpTo } = useChat()
  return (
    <button
      type="button"
      onClick={() => jumpTo(replyTo.id)}
      className={cn("mb-1.5 block w-full border-l-2 border-primary px-2 py-0.5 text-left text-xs", own ? "bg-foreground/5" : "bg-foreground/5")}
    >
      <span className="block font-medium">{replyTo.authorName}</span>
      <span className="line-clamp-1 text-muted-foreground">{replyTo.snippet}</span>
    </button>
  )
}

// ── Plain messages ──────────────────────────────────────────────────────

function TextBubble({ message, grouped }: { message: ChatMessageDTO; grouped: boolean }) {
  const { viewer, crew, reply, refresh, retrySend, discard } = useChat()
  const own = message.author?.id === viewer.id
  const crewNames = React.useMemo(() => crew.map((c) => c.name), [crew])
  const sending = message.status === "sending"
  const failed = message.status === "error"
  const canDelete = !sending && !failed && (own || viewer.role === "ADMIN")
  const touch = useTouch()
  const [open, setOpen] = React.useState(false)
  const [drag, setDrag] = React.useState(0)
  const start = React.useRef<{ x: number; y: number; moving: boolean } | null>(null)

  // Touch: swipe a message sideways to reply (like every chat app), or tap it for Reply and Delete.
  const touchHandlers = touch && !sending && !failed
    ? {
        onTouchStart: (e: React.TouchEvent) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, moving: false }
        },
        onTouchMove: (e: React.TouchEvent) => {
          const s = start.current
          if (!s) return
          const dx = e.touches[0].clientX - s.x
          const dy = e.touches[0].clientY - s.y
          if (!s.moving && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) s.moving = true
          if (s.moving) setDrag(Math.max(-72, Math.min(72, dx)))
        },
        onTouchEnd: () => {
          const s = start.current
          start.current = null
          if (s?.moving && Math.abs(drag) >= 56) {
            navigator.vibrate?.(8)
            reply(message)
          }
          setDrag(0)
        },
        onTouchCancel: () => {
          start.current = null
          setDrag(0)
        },
        onClick: (e: React.MouseEvent) => {
          // A link or button inside the message keeps its own tap.
          if ((e.target as HTMLElement).closest("a, button")) return
          setOpen((v) => !v)
        },
      }
    : {}

  return (
    <div className={cn("group flex gap-2.5", own ? "flex-row-reverse" : "flex-row")}>
      {!own && (
        <div className="w-8 shrink-0">{!grouped && <PersonAvatar person={message.author} size={32} />}</div>
      )}
      <div className={cn("flex min-w-0 max-w-[85%] flex-col sm:max-w-[min(72%,40rem)]", own ? "items-end" : "items-start")}>
        {!own && !grouped && (
          <p className="mb-1 flex items-baseline gap-2 text-xs">
            <span className="font-medium">{message.author?.name ?? "Someone"}</span>
            <span className="text-[10px] text-muted-foreground">{clock(message.createdAt)}</span>
          </p>
        )}
        <div className="relative">
          {touch && drag !== 0 && (
            <span
              aria-hidden
              className={cn("absolute top-1/2 grid size-7 -translate-y-1/2 place-items-center bg-primary text-primary-foreground", drag > 0 ? "-left-9" : "-right-9")}
              style={{ opacity: Math.min(1, Math.abs(drag) / 56) }}
            >
              <CornerUpLeft className="size-3.5" />
            </span>
          )}
          <div
            {...touchHandlers}
            style={drag ? { transform: `translateX(${drag}px)` } : undefined}
            className={cn(
              "border px-3 py-2 transition-transform",
              drag === 0 ? "duration-150" : "duration-0",
              own ? "border-primary/30 bg-primary/15" : "bg-card/80 backdrop-blur",
              sending && "opacity-60",
              failed && "border-destructive/50"
            )}
          >
            {message.replyTo && <ReplyQuote replyTo={message.replyTo} own={own} />}
            <RichText text={message.body} crewNames={crewNames} own={own} />
          </div>

          {!sending && !failed && !touch && (
            <div
              className={cn(
                "absolute top-1/2 hidden -translate-y-1/2 items-center border bg-background/95 shadow-sm group-hover:flex group-focus-within:flex",
                own ? "right-full mr-1.5" : "left-full ml-1.5"
              )}
            >
              <button type="button" onClick={() => reply(message)} className="grid size-7 place-items-center text-muted-foreground hover:text-foreground" aria-label="Reply" title="Reply">
                <CornerUpLeft className="size-3.5" />
              </button>
              {canDelete && (
                <DeleteButton messageId={message.id} onDone={refresh} />
              )}
            </div>
          )}
        </div>
        {touch && open && !sending && !failed && (
          <div className="mt-1.5 flex items-center border bg-background/95 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                reply(message)
              }}
              className="flex h-10 items-center gap-1.5 px-3 text-xs font-medium"
            >
              <CornerUpLeft className="size-4" />
              Reply
            </button>
            {canDelete && <DeleteButton messageId={message.id} onDone={refresh} label="Delete" />}
          </div>
        )}
        {own && !sending && !failed && <p className="mt-0.5 text-[10px] text-muted-foreground">{clock(message.createdAt)}</p>}
        {sending && <p className="mt-0.5 text-[10px] text-muted-foreground">Sending...</p>}
        {failed && (
          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-destructive">
            <TriangleAlert className="size-3" />
            Not sent
            <button type="button" className="underline underline-offset-2" onClick={() => retrySend(message.id)}>
              Try again
            </button>
            <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={() => discard(message.id)}>
              Discard
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

function DeleteButton({ messageId, onDone, label }: { messageId: string; onDone: () => Promise<void>; label?: string }) {
  const { tripId } = useChat()
  const [busy, setBusy] = React.useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const res = await deleteChatMessage(tripId, messageId)
        if (!res.ok) toast.error(res.error)
        await onDone()
        setBusy(false)
      }}
      className={label ? "flex h-10 items-center gap-1.5 border-l px-3 text-xs font-medium text-destructive" : "grid size-7 place-items-center text-muted-foreground hover:text-destructive"}
      aria-label="Delete message"
      title="Delete"
    >
      <Trash2 className={label ? "size-4" : "size-3.5"} />
      {label}
    </button>
  )
}

// ── Trippo ──────────────────────────────────────────────────────────────

function Thinking({ steps }: { steps: AiPayload["steps"] }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-brand" />
        Trippo is looking into it
      </p>
      <ul className="space-y-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
            {s.done ? <CircleCheck className="size-3.5 text-brand" /> : <Loader2 className="size-3.5 animate-spin" />}
            <span className={cn(!s.done && "text-foreground")}>{s.label}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-1.5 pt-1" aria-hidden>
        <div className="h-2.5 w-4/5 animate-pulse bg-foreground/8" />
        <div className="h-2.5 w-3/5 animate-pulse bg-foreground/8" />
      </div>
    </div>
  )
}

function AiBubble({ message }: { message: ChatMessageDTO }) {
  const { viewer, crew, send, refresh } = useChat()
  const payload = message.payload as AiPayload | null
  const crewNames = React.useMemo(() => crew.map((c) => c.name), [crew])
  const thinking = message.status === "thinking"
  const failed = message.status === "failed"
  const canRetry = failed && (payload?.askedById === viewer.id || viewer.role === "ADMIN")
  const [retrying, setRetrying] = React.useState(false)
  const { tripId, reply } = useChat()
  const touch = useTouch()

  return (
    <div className="flex gap-2.5">
      <TrippoAvatar size={32} />
      <div className="min-w-0 max-w-4xl flex-1">
        <p className="mb-1 flex items-baseline gap-2 text-xs">
          <span className="font-medium">Trippo</span>
          <span className="bg-primary/20 px-1 py-px text-[9px] font-semibold tracking-wider text-brand uppercase">AI</span>
          <span className="text-[10px] text-muted-foreground">{clock(message.createdAt)}</span>
          {touch && !thinking && (
            <button type="button" onClick={() => reply(message)} className="ml-auto inline-flex h-8 items-center gap-1 px-2 text-[11px] text-muted-foreground" aria-label="Reply to Trippo">
              <CornerUpLeft className="size-3.5" />
              Reply
            </button>
          )}
        </p>

        <div className="max-w-2xl border border-l-2 border-l-primary bg-card/80 px-3 py-2.5 backdrop-blur">
          {message.replyTo && <ReplyQuote replyTo={message.replyTo} own={false} />}
          {thinking ? (
            <Thinking steps={payload?.steps ?? []} />
          ) : (
            <>
              <RichText text={message.body} crewNames={crewNames} />
              {failed && (
                <div className="mt-2 flex items-center gap-2">
                  <TriangleAlert className="size-4 text-destructive" />
                  {canRetry && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      disabled={retrying}
                      onClick={async () => {
                        setRetrying(true)
                        const res = await retryTrippo(tripId, message.id)
                        if (!res.ok) toast.error(res.error)
                        await refresh()
                        setRetrying(false)
                      }}
                    >
                      <RotateCcw className="size-3.5" />
                      Ask again
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!thinking && payload && payload.cards.length > 0 && <AiCards cards={payload.cards} messageId={message.id} states={message.itemStates} />}

        {!thinking && payload && payload.followUps.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {payload.followUps.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => void send(`@trippo ${q}`)}
                  className="inline-flex max-w-full items-center gap-1.5 border bg-background/60 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-primary hover:bg-primary/10"
                >
                  <Sparkles className="size-3 shrink-0 text-brand" />
                  <span className="min-w-0">{q}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Requests ────────────────────────────────────────────────────────────

function RequestCard({ message, request }: { message: ChatMessageDTO; request: RequestDTO }) {
  const { viewer, planDays, refresh } = useChat()
  const [day, setDay] = React.useState(String(request.dayNumber ?? planDays[0]?.dayNumber ?? 1))
  const [busy, setBusy] = React.useState<"approve" | "decline" | null>(null)
  const admin = viewer.role === "ADMIN"
  const pending = request.status === "PENDING"

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "decline")
    const res = await decideRequest(request.id, approve, { dayNumber: planDays.length ? Number(day) : null, startTime: request.startTime })
    if (!res.ok) toast.error(res.error)
    else toast.success(approve ? "Added to the plan." : "Request declined.")
    await refresh()
    setBusy(null)
  }

  return (
    <div className="flex gap-2.5">
      <div className="w-8 shrink-0">
        <PersonAvatar person={request.requestedBy} size={32} />
      </div>
      <div className="min-w-0 max-w-md flex-1">
        <p className="mb-1 flex items-baseline gap-2 text-xs">
          <span className="font-medium">{request.requestedBy.name}</span>
          <span className="text-[10px] text-muted-foreground">{clock(message.createdAt)}</span>
        </p>
        <section className="border border-primary/40 bg-primary/5" aria-label="Itinerary request">
          <header className="flex items-center gap-2 border-b border-primary/20 px-3.5 py-2 text-[11px] font-medium tracking-[0.16em] uppercase">
            <ListPlus className="size-3.5 text-brand" />
            Itinerary request
            <span
              className={cn(
                "ml-auto px-1.5 py-0.5 text-[10px] font-semibold tracking-wider",
                request.status === "APPROVED" && "bg-primary text-primary-foreground",
                request.status === "DECLINED" && "bg-foreground/10 text-muted-foreground",
                pending && "bg-foreground/10"
              )}
            >
              {request.status === "PENDING" ? "Waiting" : request.status === "APPROVED" ? "Approved" : "Declined"}
            </span>
          </header>
          <div className="space-y-3 p-3.5">
            <div className="flex gap-3">
              {request.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={request.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-14 shrink-0 object-cover" />
              )}
              <div className="min-w-0">
                <p className="text-sm leading-snug font-semibold">{request.title}</p>
                {request.subtitle && <p className="text-xs text-muted-foreground">{request.subtitle}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {request.requestedBy.name.split(" ")[0]} would like this in {request.dayNumber ? `Day ${request.dayNumber}` : "the plan"}
                  {request.startTime ? ` at ${request.startTime}` : ""}.
                </p>
              </div>
            </div>
            {request.note && <p className="border-l-2 border-primary pl-2 text-xs italic">&ldquo;{request.note}&rdquo;</p>}

            {pending && admin && (
              <div className="flex flex-wrap items-center gap-2 border-t border-primary/20 pt-3">
                {planDays.length > 0 && (
                  <Select value={day} onValueChange={setDay}>
                    <SelectTrigger size="sm" className="h-8 w-40 text-xs">
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
                )}
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" disabled={busy !== null} onClick={() => decide(false)}>
                  {busy === "decline" ? <Loader2 className="size-3.5 animate-spin" /> : <CircleX className="size-3.5" />}
                  Decline
                </Button>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy !== null} onClick={() => decide(true)}>
                  {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <CircleCheck className="size-3.5" />}
                  Approve
                </Button>
              </div>
            )}
            {pending && !admin && <p className="border-t border-primary/20 pt-2 text-xs text-muted-foreground">An admin will approve or decline this here.</p>}
            {!pending && request.decidedByName && (
              <p className="border-t border-primary/20 pt-2 text-xs text-muted-foreground">
                {request.status === "APPROVED" ? "Approved" : "Declined"} by {request.decidedByName.split(" ")[0]}.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Notices ─────────────────────────────────────────────────────────────

function Notice({ message }: { message: ChatMessageDTO }) {
  const event = (message.payload as NoticePayload | null)?.event
  const Icon =
    event === "declined" ? CircleX : event === "poll_closed" ? Trophy : event === "stay_saved" ? Hotel : event === "added" || event === "approved" ? CircleCheck : Info
  return (
    <div className="flex justify-center px-4">
      <p className="inline-flex max-w-xl items-start gap-2 bg-foreground/5 px-3 py-1.5 text-center text-xs text-muted-foreground">
        <Icon className="mt-px size-3.5 shrink-0 text-brand" />
        <span>{message.body}</span>
      </p>
    </div>
  )
}

// ── Entry point ─────────────────────────────────────────────────────────

/** Is this message part of the same run as the one before (same sender, close in time)? */
export function isGrouped(message: ChatMessageDTO, previous: ChatMessageDTO | null): boolean {
  if (!previous || previous.kind !== "TEXT" || message.kind !== "TEXT") return false
  if (previous.author?.id !== message.author?.id) return false
  return new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000
}

export function ChatMessageView({ message, previous }: { message: ChatMessageDTO; previous: ChatMessageDTO | null }) {
  const grouped = isGrouped(message, previous)

  if (message.kind === "SYSTEM") return <Notice message={message} />
  if (message.kind === "AI") return <AiBubble message={message} />
  if (message.kind === "REQUEST" && message.request) return <RequestCard message={message} request={message.request} />
  if (message.kind === "POLL" && message.poll) {
    return (
      <div className="flex gap-2.5">
        <div className="w-8 shrink-0">
          <PersonAvatar person={message.author} size={32} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 flex items-baseline gap-2 text-xs">
            <span className="font-medium">{message.author?.name ?? "Someone"}</span>
            <span className="text-[10px] text-muted-foreground">{clock(message.createdAt)}</span>
          </p>
          <PollMessage message={message} />
        </div>
      </div>
    )
  }
  return <TextBubble message={message} grouped={grouped} />
}
