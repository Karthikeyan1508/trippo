"use client"

import * as React from "react"
import { format, isToday, isYesterday } from "date-fns"
import { ArrowDown, BarChart3, ListPlus, Loader2, MessagesSquare, Sparkles, Users } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import type { ChatMessageDTO, ChatSnapshot } from "@/lib/chat"
import { createPoll } from "@/server/polls"
import { getChat, markChatRead, sendChatMessage } from "@/server/chat"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ChatComposer } from "./chat-composer"
import { ChatProvider, type ChatActions, type Crew, type PlanDay } from "./chat-context"
import { NewPollDialog } from "./chat-dialogs"
import { ChatMessageView } from "./chat-message"
import { PersonAvatar, TrippoAvatar } from "./chat-people"
import { useNow } from "./use-now"

export type CrewChatProps = {
  tripId: string
  tripName: string
  destination: string
  currency: string
  viewer: Crew
  crew: Crew[]
  planDays: PlanDay[]
  /** Editable starter questions, e.g. "@trippo top 3 hotels near Colombo". */
  prompts: string[]
  initial: ChatSnapshot
}

const byCreated = (a: ChatMessageDTO, b: ChatMessageDTO) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1

const isTemp = (m: ChatMessageDTO) => m.id.startsWith("tmp-")

function dayLabel(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "EEEE, d MMM")
}

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString()

// ── The side rail: what needs you ───────────────────────────────────────

function Rail({
  messages,
  prompts,
  crew,
  viewer,
  onPrompt,
  onJump,
}: {
  messages: ChatMessageDTO[]
  prompts: string[]
  crew: Crew[]
  viewer: Crew
  onPrompt: (text: string) => void
  onJump: (id: string) => void
}) {
  const now = useNow()
  const observer = viewer.role === "OBSERVER"
  const polls = messages.filter(
    (m) => m.kind === "POLL" && m.poll && !m.poll.closed && !(m.poll.closesAt && now !== null && new Date(m.poll.closesAt).getTime() <= now)
  )
  const toVote = observer ? [] : polls.filter((m) => !m.poll?.myVote)
  const requests = messages.filter((m) => m.kind === "REQUEST" && m.request?.status === "PENDING")
  const needs = toVote.length + (viewer.role === "ADMIN" ? requests.length : 0)

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Needs you
          {needs > 0 && <span className="bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground tabular-nums">{needs}</span>}
        </h3>
        {needs === 0 && polls.length === 0 && requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting. Polls and requests show up here.</p>
        ) : (
          <ul className="space-y-1.5">
            {polls.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onJump(m.id)} className="flex w-full items-start gap-2.5 border bg-card/60 p-2.5 text-left hover:border-primary/50">
                  <BarChart3 className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm leading-snug font-medium">{m.poll?.question}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {m.poll?.myVote ? "You voted" : observer ? "Open poll" : "Your vote is needed"}, {m.poll?.votedUserIds.length ?? 0} voted
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {requests.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onJump(m.id)} className="flex w-full items-start gap-2.5 border border-primary/30 bg-primary/5 p-2.5 text-left hover:border-primary/60">
                  <ListPlus className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm leading-snug font-medium">{m.request?.title}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {viewer.role === "ADMIN" ? "Approve or decline" : "Waiting for an admin"}, from {m.request?.requestedBy.name.split(" ")[0]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          <Sparkles className="size-3 text-brand" />
          Ask Trippo
        </h3>
        <ul className="space-y-1.5">
          {prompts.map((p) => (
            <li key={p}>
              <button type="button" onClick={() => onPrompt(p)} className="w-full border bg-card/60 px-2.5 py-2 text-left text-sm leading-snug hover:border-primary/50 hover:bg-primary/5">
                {p.replace(/^@trippo\s*/i, "")}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Trippo searches live hotel, map and transport data. Add what you like to the itinerary, or put it to a vote.
        </p>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          <Users className="size-3" />
          In this chat
        </h3>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2.5 text-sm">
            <TrippoAvatar size={24} />
            <span className="font-medium">Trippo</span>
            <span className="ml-auto text-[10px] tracking-wider text-brand uppercase">AI</span>
          </li>
          {crew.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 text-sm">
              <PersonAvatar person={c} size={24} />
              <span className="truncate">{c.name}</span>
              {c.id === viewer.id && <span className="text-xs text-muted-foreground">(you)</span>}
              <span className="ml-auto text-[10px] tracking-wider text-muted-foreground uppercase">{c.role === "ADMIN" ? "Admin" : c.role === "OBSERVER" ? "Observer" : ""}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ── The chat ────────────────────────────────────────────────────────────

export function CrewChat({ tripId, tripName, destination, currency, viewer, crew, planDays, prompts, initial }: CrewChatProps) {
  const [messages, setMessages] = React.useState<ChatMessageDTO[]>(initial.messages)
  const [hasMore, setHasMore] = React.useState(initial.hasMore)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [replyTo, setReplyTo] = React.useState<ChatMessageDTO | null>(null)
  const [pollOpen, setPollOpen] = React.useState(false)
  const [railOpen, setRailOpen] = React.useState(false)
  const [newBelow, setNewBelow] = React.useState(0)

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const atBottom = React.useRef(true)
  const sinceRef = React.useRef(initial.now)
  const pending = React.useRef(new Map<string, { body: string; replyId: string | null }>())
  const lastReadRef = React.useRef<string | null>(null)
  const prepending = React.useRef<number | null>(null)
  const messagesRef = React.useRef(messages)
  React.useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // ── Merging what the server sends ───────────────────────────────────
  const merge = React.useCallback((incoming: ChatMessageDTO[], authoritative = false) => {
    if (incoming.length === 0 && !authoritative) return
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]))
      if (authoritative && incoming.length > 0) {
        // A full refresh is the truth for its window: anything inside it that's gone was deleted.
        const oldest = incoming[0].createdAt
        const keep = new Set(incoming.map((m) => m.id))
        for (const m of prev) if (!isTemp(m) && m.createdAt >= oldest && !keep.has(m.id)) map.delete(m.id)
      }
      for (const m of incoming) map.set(m.id, m)
      // A message we sent shows up for real: drop its "sending" placeholder.
      for (const t of prev.filter(isTemp)) {
        const twin = incoming.find((m) => m.author?.id === t.author?.id && m.body === t.body && m.createdAt >= t.createdAt.slice(0, 19))
        if (twin) map.delete(t.id)
      }
      return [...map.values()].sort(byCreated)
    })
  }, [])

  const refresh = React.useCallback(async () => {
    const res = await getChat(tripId, { since: new Date(Date.parse(sinceRef.current) - 3000).toISOString(), present: true })
    if (res.ok) {
      merge(res.snapshot.messages)
      sinceRef.current = res.snapshot.now
    }
  }, [tripId, merge])

  // ── Polling: quick while Trippo is working or the chat is in view ─────
  React.useEffect(() => {
    let alive = true
    let timer = 0
    let tick = 0
    const run = async () => {
      const visible = document.visibilityState === "visible"
      try {
        const full = tick % 15 === 14
        const res = await getChat(
          tripId,
          full ? { limit: 50, present: visible } : { since: new Date(Date.parse(sinceRef.current) - 3000).toISOString(), present: visible }
        )
        if (alive && res.ok) {
          merge(res.snapshot.messages, full)
          sinceRef.current = res.snapshot.now
        }
      } catch {
        /* offline: try again next time */
      }
      tick++
      if (!alive) return
      const thinking = messagesRef.current.some((m) => m.kind === "AI" && m.status === "thinking")
      timer = window.setTimeout(run, !visible ? 15_000 : thinking ? 1_200 : 2_500)
    }
    timer = window.setTimeout(run, 1_500)
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer)
        timer = window.setTimeout(run, 0)
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      alive = false
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [tripId, merge])

  // ── Scrolling ───────────────────────────────────────────────────────
  const scrollToBottom = React.useCallback((smooth = false) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
    atBottom.current = true
    setNewBelow(0)
  }, [])

  React.useLayoutEffect(() => {
    scrollToBottom(false)
  }, [scrollToBottom])

  // Content grows (a Trippo answer lands, images load): stay pinned if the reader was at the bottom.
  React.useEffect(() => {
    const content = contentRef.current
    const el = scrollRef.current
    if (!content || !el) return
    const observer = new ResizeObserver(() => {
      if (prepending.current !== null) return
      if (atBottom.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const lastId = messages[messages.length - 1]?.id
  const seenLast = React.useRef(lastId)
  React.useEffect(() => {
    if (lastId === seenLast.current) return
    seenLast.current = lastId
    const last = messagesRef.current[messagesRef.current.length - 1]
    if (!last) return
    if (atBottom.current || last.author?.id === viewer.id) scrollToBottom(true)
    else setNewBelow((n) => n + 1)
  }, [lastId, scrollToBottom, viewer.id])

  // Older messages arrived above: keep the reader where they were.
  React.useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && prepending.current !== null) {
      el.scrollTop += el.scrollHeight - prepending.current
      prepending.current = null
    }
  }, [messages])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 96
    atBottom.current = bottom
    if (bottom) setNewBelow(0)
  }

  async function loadEarlier() {
    const oldest = messages.find((m) => !isTemp(m))
    if (!oldest || loadingMore) return
    setLoadingMore(true)
    const res = await getChat(tripId, { before: oldest.createdAt, limit: 40 })
    if (res.ok) {
      prepending.current = scrollRef.current?.scrollHeight ?? 0
      merge(res.snapshot.messages)
      setHasMore(res.snapshot.hasMore)
    }
    setLoadingMore(false)
  }

  // ── Read state: mark read while the chat is in view and at the bottom ──
  React.useEffect(() => {
    const newest = [...messages].reverse().find((m) => !isTemp(m) && m.author?.id !== viewer.id && m.kind !== "SYSTEM")
    if (!newest || newest.id === lastReadRef.current) return
    if (document.visibilityState !== "visible" || !atBottom.current) return
    const timer = window.setTimeout(() => {
      lastReadRef.current = newest.id
      void markChatRead(tripId)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [messages, tripId, viewer.id, newBelow])

  // ── Sending ─────────────────────────────────────────────────────────
  const quoteOf = React.useCallback((id: string | null): ChatMessageDTO["replyTo"] => {
    const m = id ? messagesRef.current.find((x) => x.id === id) : null
    return m ? { id: m.id, authorName: m.author?.name ?? "Trippo", snippet: (m.body || "A poll").slice(0, 80) } : null
  }, [])

  const post = React.useCallback(
    async (tmpId: string, body: string, replyId: string | null) => {
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: "sending" } : m)))
      try {
        const res = await sendChatMessage(tripId, body, replyId)
        if (res.ok) {
          pending.current.delete(tmpId)
          setMessages((prev) => {
            const map = new Map(prev.filter((m) => m.id !== tmpId).map((m) => [m.id, m]))
            for (const m of res.messages) map.set(m.id, m)
            return [...map.values()].sort(byCreated)
          })
          // The next poll fetches from here; nothing between was missed.
        } else {
          toast.error(res.error)
          setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: "error" } : m)))
        }
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: "error" } : m)))
      }
    },
    [tripId]
  )

  const send = React.useCallback(
    async (text: string, replyId: string | null = null) => {
      const body = text.trim()
      if (!body) return
      const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const stamp = new Date().toISOString()
      const tmp: ChatMessageDTO = {
        id: tmpId,
        kind: "TEXT",
        body,
        createdAt: stamp,
        updatedAt: stamp,
        status: "sending",
        author: { id: viewer.id, name: viewer.name, image: viewer.image },
        replyTo: quoteOf(replyId),
        mentionIds: [],
        payload: null,
        poll: null,
        request: null,
        itemStates: {},
      }
      pending.current.set(tmpId, { body, replyId })
      setMessages((prev) => [...prev, tmp].sort(byCreated))
      await post(tmpId, body, replyId)
    },
    [viewer.id, viewer.name, viewer.image, quoteOf, post]
  )

  function submitDraft() {
    const text = draft
    const replyId = replyTo?.id ?? null
    if (!text.trim()) return
    setDraft("")
    setReplyTo(null)
    void send(text, replyId)
  }

  // ── What the pieces of the chat can do ──────────────────────────────
  const jumpTo = React.useCallback((id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`)
    if (!el) {
      toast.message("That message is further back. Scroll up to load earlier ones.")
      return
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" })
    el.classList.remove("chat-flash")
    void el.offsetWidth
    el.classList.add("chat-flash")
    window.setTimeout(() => el.classList.remove("chat-flash"), 1800)
  }, [])

  const actions = React.useMemo<ChatActions>(
    () => ({
      tripId,
      currency,
      viewer,
      crew,
      planDays,
      refresh,
      prefill: (text) => {
        setDraft(text)
        requestAnimationFrame(() => inputRef.current?.focus())
      },
      send: (text) => send(text),
      jumpTo,
      reply: (m) => {
        setReplyTo(m)
        requestAnimationFrame(() => inputRef.current?.focus())
      },
      patch: (id, change) => setMessages((prev) => prev.map((m) => (m.id === id ? change(m) : m))),
      retrySend: (id) => {
        const entry = pending.current.get(id)
        if (entry) void post(id, entry.body, entry.replyId)
      },
      discard: (id) => {
        pending.current.delete(id)
        setMessages((prev) => prev.filter((m) => m.id !== id))
      },
    }),
    [tripId, currency, viewer, crew, planDays, refresh, send, jumpTo, post]
  )

  const askTrippo = (text: string) => {
    setRailOpen(false)
    actions.prefill(text)
  }

  const submitPoll = async (v: { question: string; options: string[]; closesInMinutes: number | null }) => {
    const res = await createPoll(tripId, v.question, v.options, v.closesInMinutes)
    if (!res.ok) return res
    toast.success("Poll started. The crew has been told.")
    await refresh()
    return { ok: true as const }
  }

  const needsYou = React.useMemo(
    () =>
      messages.filter((m) => (m.kind === "POLL" && m.poll && !m.poll.closed && !m.poll.myVote && viewer.role !== "OBSERVER") || (m.kind === "REQUEST" && m.request?.status === "PENDING" && viewer.role === "ADMIN")).length,
    [messages, viewer.role]
  )

  const visible = messages
  const stack = crew.slice(0, 5)

  return (
    <ChatProvider value={actions}>
      <div data-chat-root className="flex min-h-[22rem] flex-1 border bg-background/40 backdrop-blur-xl">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
            <span className="grid size-8 shrink-0 place-items-center bg-primary/20 text-brand">
              <MessagesSquare className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">Crew chat</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {crew.length} {crew.length === 1 ? "person" : "people"} and Trippo, planning {destination}
              </p>
            </div>
            <ul className="hidden -space-x-1.5 sm:flex" aria-label="Crew">
              {stack.map((c) => (
                <li key={c.id} className="ring-2 ring-background">
                  <PersonAvatar person={c} size={26} />
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" className="relative h-8 gap-1.5 text-xs xl:hidden" onClick={() => setRailOpen(true)}>
              <BarChart3 className="size-3.5" />
              <span className="hidden sm:inline">Decisions</span>
              {needsYou > 0 && <span className="absolute -top-1.5 -right-1.5 grid min-w-4 place-items-center bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums">{needsYou}</span>}
            </Button>
          </header>

          {/* Messages */}
          <div className="relative min-h-0 flex-1">
            <div ref={scrollRef} onScroll={onScroll} className="absolute inset-0 overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-label={`Chat for ${tripName}`}>
              <div ref={contentRef} className="mx-auto flex min-h-full max-w-6xl flex-col justify-end gap-0.5 px-3 py-3 sm:px-4">
                {hasMore && (
                  <div className="flex justify-center pb-2">
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={loadEarlier} disabled={loadingMore}>
                      {loadingMore && <Loader2 className="size-3.5 animate-spin" />}
                      Load earlier messages
                    </Button>
                  </div>
                )}

                {visible.length === 0 && (
                  <div className="mx-auto my-auto max-w-sm space-y-3 py-8 text-center">
                    <TrippoAvatar size={44} className="mx-auto" />
                    <h3 className="text-base font-semibold">Start the conversation</h3>
                    <p className="text-sm text-muted-foreground">
                      Plan out loud with your crew. Type <span className="bg-primary px-1 font-medium text-primary-foreground">@trippo</span> to ask for hotels, ways to get from one stop to the next, or things to do, then add them to the itinerary or put them to a vote.
                    </p>
                  </div>
                )}

                {visible.map((m, i) => {
                  const previous = visible[i - 1] ?? null
                  const newDay = !previous || !sameDay(previous.createdAt, m.createdAt)
                  const grouped = !newDay && previous && previous.kind === "TEXT" && m.kind === "TEXT" && previous.author?.id === m.author?.id && Date.parse(m.createdAt) - Date.parse(previous.createdAt) < 5 * 60_000
                  return (
                    <React.Fragment key={m.id}>
                      {newDay && (
                        <div className="my-2 flex items-center gap-3 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                          <span className="h-px flex-1 bg-border" />
                          {dayLabel(m.createdAt)}
                          <span className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      <div data-mid={m.id} className={cn("py-0.5", !grouped && !newDay && "mt-2")}>
                        <ChatMessageView message={m} previous={newDay ? null : previous} />
                      </div>
                    </React.Fragment>
                  )
                })}
              </div>
            </div>

            {newBelow > 0 && (
              <button
                type="button"
                onClick={() => scrollToBottom(true)}
                className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg"
              >
                <ArrowDown className="size-3.5" />
                {newBelow} new {newBelow === 1 ? "message" : "messages"}
              </button>
            )}
          </div>

          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSend={submitDraft}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            prompts={prompts}
            onPoll={() => setPollOpen(true)}
            inputRef={inputRef}
            sending={false}
          />
        </div>

        {/* Desktop rail */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l bg-background/30 p-3.5 xl:block 2xl:w-80" aria-label="Decisions and requests">
          <Rail messages={messages} prompts={prompts} crew={crew} viewer={viewer} onPrompt={askTrippo} onJump={jumpTo} />
        </aside>
      </div>

      {/* Mobile rail */}
      <Sheet open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent side="right" className="w-[22rem] max-w-[92vw] overflow-y-auto p-5">
          <SheetHeader className="px-0">
            <SheetTitle>Decisions and requests</SheetTitle>
            <SheetDescription>What needs you, and things to ask Trippo.</SheetDescription>
          </SheetHeader>
          <Rail
            messages={messages}
            prompts={prompts}
            crew={crew}
            viewer={viewer}
            onPrompt={askTrippo}
            onJump={(id) => {
              setRailOpen(false)
              window.setTimeout(() => jumpTo(id), 250)
            }}
          />
        </SheetContent>
      </Sheet>

      <NewPollDialog open={pollOpen} onOpenChange={setPollOpen} onSubmit={submitPoll} />
    </ChatProvider>
  )
}
