"use client"

import * as React from "react"
import { BarChart3, CornerUpLeft, SendHorizontal, Sparkles, X } from "lucide-react"
import { cn } from "cn"

import { TRIPPO_HANDLE, mentionHandle, type ChatMessageDTO } from "@/lib/chat"
import { Button } from "@/components/ui/button"
import { useChat } from "./chat-context"
import { PersonAvatar, TrippoAvatar } from "./chat-people"

const MAX = 1500

type Suggestion = { key: string; name: string; hint: string; handle: string; image: string | null; ai?: boolean }

/** The "@..." the caret is in, if any: where it starts and what has been typed after the @. */
function mentionAt(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret)
  const match = before.match(/(^|\s)@([\p{L}]*)$/u)
  if (!match) return null
  return { start: caret - match[2].length - 1, query: match[2] }
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  replyTo,
  onClearReply,
  prompts,
  onPoll,
  inputRef,
  sending,
}: {
  value: string
  onChange: (next: string) => void
  onSend: () => void
  replyTo: ChatMessageDTO | null
  onClearReply: () => void
  prompts: string[]
  onPoll: () => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  sending: boolean
}) {
  const { crew, viewer } = useChat()
  const [caret, setCaret] = React.useState(0)
  const [active, setActive] = React.useState(0)
  const [focused, setFocused] = React.useState(false)
  const [dismissed, setDismissed] = React.useState<number | null>(null)
  const [roomy, setRoomy] = React.useState(true)

  // A long placeholder gets cut off in a narrow box, so shorten it when there is little room.
  React.useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setRoomy(entry.contentRect.width >= 360))
    observer.observe(el)
    return () => observer.disconnect()
  }, [inputRef])

  // Grow with the text, up to a few lines. An empty box stays one line whatever its placeholder does.
  React.useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = value ? `${Math.min(el.scrollHeight, 168)}px` : ""
  }, [value, inputRef, roomy])

  const mention = mentionAt(value, caret)
  const suggestions = React.useMemo<Suggestion[]>(() => {
    if (!mention || dismissed === mention.start) return []
    const q = mention.query.toLowerCase()
    const all: Suggestion[] = [
      { key: "trippo", name: "Trippo", hint: "Ask the AI: hotels, routes, places", handle: TRIPPO_HANDLE, image: null, ai: true },
      ...crew
        .filter((c) => c.id !== viewer.id)
        .map((c) => ({ key: c.id, name: c.name, hint: c.role === "ADMIN" ? "Admin" : c.role === "OBSERVER" ? "Observer" : "Crew", handle: mentionHandle(c.name), image: c.image })),
    ]
    return all.filter((s) => s.handle.toLowerCase().startsWith(q))
  }, [mention, dismissed, crew, viewer.id])

  function pick(s: Suggestion) {
    if (!mention) return
    const after = value.slice(caret)
    const next = `${value.slice(0, mention.start)}@${s.handle} ${after}`
    onChange(next)
    const position = mention.start + s.handle.length + 2
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(position, position)
      setCaret(position)
    })
    setActive(0)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        setActive((i) => (i + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        pick(suggestions[Math.min(active, suggestions.length - 1)])
        return
      }
      if (event.key === "Escape" && mention) {
        event.preventDefault()
        setDismissed(mention.start)
        return
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onSend()
    }
  }

  const empty = value.trim().length === 0
  const asking = /(^|\s)@trippo\b/i.test(value)

  return (
    <div className="@container border-t bg-background/70 px-3 py-2.5 backdrop-blur-xl sm:px-4">
      {empty && !replyTo && prompts.length > 0 && (
        // On wide screens the side rail already lists these.
        <ul className="no-scrollbar -mx-1 mb-2 flex gap-2 overflow-x-auto px-1 xl:hidden" aria-label="Things to ask Trippo">
          {prompts.map((p) => (
            <li key={p} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  onChange(p)
                  inputRef.current?.focus()
                }}
                className="inline-flex items-center gap-1.5 border bg-card/70 px-2.5 py-1.5 text-xs transition-colors hover:border-primary hover:bg-primary/10"
              >
                <Sparkles className="size-3 text-brand" />
                {p.replace(/^@trippo\s*/i, "")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {replyTo && (
        <div className="mb-2 flex items-start gap-2 border-l-2 border-primary bg-foreground/5 px-2.5 py-1.5 text-xs">
          <CornerUpLeft className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Replying to {replyTo.author?.name ?? "Trippo"}</p>
            <p className="line-clamp-1 text-muted-foreground">{replyTo.body || "A poll"}</p>
          </div>
          <button type="button" onClick={onClearReply} aria-label="Cancel reply" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className={cn("relative flex items-end gap-1 border bg-card/80 p-1 transition-colors", focused ? "border-primary" : "border-border")}>
        {suggestions.length > 0 && (
          <ul role="listbox" aria-label="Mention someone" className="absolute bottom-full left-0 z-20 mb-2 w-72 max-w-full border bg-popover p-1 shadow-lg">
            {suggestions.map((s, i) => (
              <li key={s.key} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(s)
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-2.5 px-2 py-1.5 text-left", i === active ? "bg-foreground/8" : "")}
                >
                  {s.ai ? <TrippoAvatar size={26} /> : <PersonAvatar person={{ name: s.name, image: s.image }} size={26} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{s.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2.5 text-xs"
            onClick={() => {
              const el = inputRef.current
              if (!/(^|\s)@trippo\b/i.test(value)) onChange(`@trippo ${value}`.replace(/\s+$/, " "))
              el?.focus()
            }}
            title="Ask Trippo"
            aria-label="Ask Trippo"
          >
            <Sparkles className="size-4 text-brand" />
            <span className="hidden @xl:inline">Ask Trippo</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2.5 text-xs"
            onClick={onPoll}
            disabled={viewer.role === "OBSERVER"}
            title="Start a poll"
            aria-label="Start a poll"
          >
            <BarChart3 className="size-4" />
            <span className="hidden @xl:inline">Poll</span>
          </Button>
        </div>

        <textarea
          ref={inputRef}
          value={value}
          rows={1}
          maxLength={MAX}
          onChange={(e) => {
            onChange(e.target.value)
            setCaret(e.target.selectionStart)
            setActive(0)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={roomy ? "Message the crew. Type @trippo to ask the AI" : "Message the crew"}
          aria-label="Message the crew"
          className="block max-h-42 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground"
        />

        <div className="flex shrink-0 items-center gap-2">
          {value.length > MAX - 200 && <span className="text-[10px] text-muted-foreground tabular-nums">{MAX - value.length}</span>}
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5 px-3"
            onClick={onSend}
            disabled={empty || sending}
            aria-label={asking ? "Ask Trippo" : "Send message"}
            title={asking ? "Ask Trippo (Enter)" : "Send (Enter). Shift+Enter for a new line"}
          >
            {asking ? <Sparkles className="size-4" /> : <SendHorizontal className="size-4" />}
            <span className="hidden text-xs @md:inline">{asking ? "Ask" : "Send"}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
