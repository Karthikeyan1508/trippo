"use client"

import * as React from "react"
import {
  BarChart3,
  Bike,
  Bus,
  Car,
  CarTaxiFront,
  CircleCheck,
  Clock,
  ExternalLink,
  Footprints,
  Hotel,
  MapPinned,
  Navigation,
  Plane,
  Plus,
  Route as RouteIcon,
  Ship,
  Star,
  TrainFront,
  Vote,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import {
  formatMinutes,
  type ChatCard,
  type HotelItem,
  type HotelsCard,
  type ItemState,
  type PlaceItem,
  type PlacesCard,
  type TransportCard,
  type TransportItem,
  type TransportMode,
} from "@/lib/chat"
import { addCardToPlan, startCardPoll } from "@/server/chat"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useChat, isObserver } from "./chat-context"
import { AddToPlanDialog, StartPollDialog, type SubmitResult } from "./chat-dialogs"

type States = Record<string, ItemState>

// ── Shared pieces ───────────────────────────────────────────────────────

/** How an item stands: added, waiting for the admin, or in a poll. Falls back to the add button. */
function ItemAction({
  state,
  onAdd,
  observer,
  admin,
}: {
  state: ItemState | undefined
  onAdd: () => void
  observer: boolean
  admin: boolean
}) {
  const { jumpTo } = useChat()
  if (state?.kind === "added") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 bg-primary/20 px-2.5 text-xs font-medium text-brand">
        <CircleCheck className="size-3.5" />
        {state.dayNumber ? `In the plan, Day ${state.dayNumber}` : "Chosen as your stay"}
      </span>
    )
  }
  if (state?.kind === "pending") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 bg-foreground/8 px-2.5 text-xs font-medium text-muted-foreground">
        <Clock className="size-3.5" />
        Waiting for the admin
      </span>
    )
  }
  if (state?.kind === "poll") {
    return (
      <button
        type="button"
        onClick={() => jumpTo(state.pollMessageId)}
        className="inline-flex h-8 items-center gap-1.5 bg-foreground/8 px-2.5 text-xs font-medium hover:bg-foreground/12"
      >
        <Vote className="size-3.5" />
        {state.closed ? "Poll closed" : "In a poll"}
      </button>
    )
  }
  return (
    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onAdd} disabled={observer}>
      <Plus className="size-3.5" />
      {admin ? "Add to itinerary" : "Request to add"}
    </Button>
  )
}

/** One tile of a hotel or place card. Swipes sideways when the card is narrow, sits in a grid when wide. */
const TILE =
  "flex w-[80%] max-w-[18rem] min-w-0 shrink-0 snap-start flex-col border bg-card @[40rem]:w-auto @[40rem]:max-w-none @[40rem]:shrink"

// Columns by how many results there are, so the last row is never a lone tile (four make a 2 by 2).
const COLUMNS: Record<number, string> = {
  1: "@[40rem]:grid-cols-1",
  2: "@[40rem]:grid-cols-2",
  3: "@[40rem]:grid-cols-3",
  4: "@[40rem]:grid-cols-2",
}

/** A card with one or two results should not stretch across the whole message. */
const shellWidth = (count: number) => (count <= 1 ? "max-w-sm" : count === 2 ? "max-w-2xl" : count === 4 ? "max-w-3xl" : "")

function Tiles({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex snap-x snap-mandatory scroll-px-2 gap-2 overflow-x-auto p-2 [&>*:only-child]:w-full [&>*:only-child]:max-w-none",
        "@[40rem]:grid @[40rem]:snap-none @[40rem]:overflow-visible",
        COLUMNS[count] ?? COLUMNS[3]
      )}
    >
      {children}
    </div>
  )
}

function CardShell({
  icon: Icon,
  title,
  meta,
  children,
  footer,
  className,
}: {
  icon: LucideIcon
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("@container mt-2 w-full border bg-background/50 backdrop-blur-sm", className)}>
      <header className="flex items-center gap-2.5 border-b px-3 py-2">
        <span className="grid size-7 shrink-0 place-items-center bg-primary/20 text-brand">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {meta && <p className="truncate text-[11px] text-muted-foreground">{meta}</p>}
        </div>
      </header>
      {children}
      {footer && <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">{footer}</footer>}
    </section>
  )
}

function Photo({ src, icon: Icon, className }: { src?: string; icon: LucideIcon; className?: string }) {
  const [failed, setFailed] = React.useState(false)
  return (
    <div className={cn("relative h-36 overflow-hidden bg-muted @[40rem]:h-44", className)}>
      <div className="absolute inset-0 grid place-items-center text-muted-foreground">
        <Icon className="size-7 opacity-60" />
      </div>
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
      )}
    </div>
  )
}

function Rating({ rating, reviews }: { rating?: number; reviews?: number }) {
  if (!rating) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium tabular-nums">{rating.toFixed(1)}</span>
      {reviews ? <span className="text-muted-foreground tabular-nums">({reviews.toLocaleString("en-IN")})</span> : null}
    </span>
  )
}

function SelectBox({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <label className="grid size-7 cursor-pointer place-items-center bg-background/80 backdrop-blur" title="Include in a poll">
      <span className="sr-only">{label}</span>
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
    </label>
  )
}

/** Wires a card's "add" and "poll" buttons to the dialogs and the server. */
function useCardActions(messageId: string, card: ChatCard, states: States) {
  const { tripId, viewer, refresh, planDays } = useChat()
  const [adding, setAdding] = React.useState<{ key: string; name: string; kind: "hotel" | "transport" | "place"; day: number; time: string } | null>(null)
  const [polling, setPolling] = React.useState(false)
  const [selected, setSelected] = React.useState<string[]>(() => card.items.map((i) => i.key))

  const submitAdd = async (v: { dayNumber: number | null; startTime: string | null; note: string }): Promise<SubmitResult> => {
    if (!adding) return { ok: false, error: "Nothing to add." }
    const res = await addCardToPlan({ tripId, messageId, cardId: card.id, itemKey: adding.key, dayNumber: v.dayNumber, startTime: v.startTime, note: v.note })
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

  const submitPoll = async (v: { itemKeys: string[]; question: string; closesInMinutes: number | null }): Promise<SubmitResult> => {
    const res = await startCardPoll({ tripId, messageId, cardId: card.id, ...v })
    if (!res.ok) return res
    toast.success("Poll started. The crew has been told.")
    await refresh()
    return { ok: true }
  }

  return {
    observer: isObserver(viewer.role),
    pollable: card.items.length > 1,
    // While a poll on these options is open, another one would only split the vote.
    openPollId: (() => {
      for (const item of card.items) {
        const st = states[item.key]
        if (st?.kind === "poll" && !st.closed) return st.pollMessageId
      }
      return undefined
    })(),
    admin: viewer.role === "ADMIN",
    hasPlan: planDays.length > 0,
    selected,
    toggle: (key: string, on: boolean) => setSelected((prev) => (on ? [...new Set([...prev, key])] : prev.filter((k) => k !== key))),
    adding,
    startAdd: (key: string, name: string, kind: "hotel" | "transport" | "place", day = 1, time = "") => setAdding({ key, name, kind, day, time }),
    closeAdd: () => setAdding(null),
    polling,
    setPolling,
    submitAdd,
    submitPoll,
  }
}

function PollFooter({
  count,
  total,
  observer,
  onPoll,
  openPollId,
}: {
  count: number
  total: number
  observer: boolean
  onPoll: () => void
  openPollId?: string
}) {
  const { jumpTo } = useChat()
  if (openPollId) {
    return (
      <>
        <p className="text-xs text-muted-foreground">A poll is open for these. You can start another once it closes.</p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => jumpTo(openPollId)}>
            View poll
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled>
            <CircleCheck className="size-3.5" />
            Poll created
          </Button>
        </div>
      </>
    )
  }
  return (
    <>
      <p className="text-xs text-muted-foreground">Not sure? Let the crew decide.</p>
      <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onPoll} disabled={observer || count < 2}>
        <BarChart3 className="size-3.5" />
        Start a poll with {count} of {total}
      </Button>
    </>
  )
}

function Dialogs({ actions, card }: { actions: ReturnType<typeof useCardActions>; card: ChatCard }) {
  return (
    <>
      {actions.adding && (
        <AddToPlanDialog
          open
          onOpenChange={(open) => !open && actions.closeAdd()}
          name={actions.adding.name}
          kind={actions.adding.kind}
          defaultDay={actions.adding.day}
          defaultTime={actions.adding.time}
          onSubmit={actions.submitAdd}
        />
      )}
      <StartPollDialog open={actions.polling} onOpenChange={actions.setPolling} card={card} initialKeys={actions.selected} onSubmit={actions.submitPoll} />
    </>
  )
}

// ── Hotels ──────────────────────────────────────────────────────────────

function HotelTile({
  item,
  area,
  state,
  checked,
  onCheck,
  actions,
}: {
  item: HotelItem
  area?: string
  state?: ItemState
  checked: boolean
  onCheck: (on: boolean) => void
  actions: ReturnType<typeof useCardActions>
}) {
  return (
    <article className={TILE}>
      <div className="relative">
        <Photo src={item.image} icon={Hotel} />
        {item.badge && (
          <span className="absolute top-2 left-2 bg-primary px-2 py-0.5 text-[10px] font-semibold tracking-wider text-primary-foreground uppercase">
            {item.badge}
          </span>
        )}
        {actions.pollable && !actions.openPollId && (
          <div className="absolute top-2 right-2">
            <SelectBox checked={checked} onChange={onCheck} label={`Include ${item.name} in a poll`} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h4 className="line-clamp-2 text-sm leading-snug font-semibold">{item.name}</h4>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Rating rating={item.rating} reviews={item.reviews} />
          {item.stars ? <span className="text-xs text-muted-foreground">{item.stars}-star</span> : null}
        </div>
        {item.priceNight ? (
          <div>
            <p className="flex items-baseline gap-1">
              <span className="text-lg font-semibold tabular-nums">{item.priceNight}</span>
              <span className="text-xs text-muted-foreground">per night</span>
            </p>
            {item.priceTotal && <p className="text-[11px] text-muted-foreground">{item.priceTotal} for the stay</p>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Price not listed for these dates</p>
        )}
        {item.distanceKm !== undefined && (
          <p className="text-xs text-muted-foreground">
            {item.distanceKm} km from {area ?? "the centre"}
          </p>
        )}
        {item.amenities.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {item.amenities.slice(0, 3).map((a) => (
              <li key={a} className="bg-foreground/8 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {a}
              </li>
            ))}
          </ul>
        )}
        {item.nearby[0] && <p className="text-[11px] text-muted-foreground">Near: {item.nearby[0]}</p>}
        {item.why && <p className="border-l-2 border-primary pl-2 text-xs leading-relaxed">{item.why}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <ItemAction
            state={state}
            observer={actions.observer}
            admin={actions.admin}
            onAdd={() => actions.startAdd(item.key, item.name, "hotel", 1, item.checkIn ? to24(item.checkIn) : "14:00")}
          />
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-8 items-center justify-center text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
              aria-label={`Open ${item.name}`}
              title="Open the hotel's page"
            >
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

/** "3:00 PM" to "15:00", for pre-filling the time field. */
function to24(clock: string): string {
  const m = clock.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!m) return ""
  let h = Number(m[1])
  if (/pm/i.test(m[3] ?? "") && h < 12) h += 12
  if (/am/i.test(m[3] ?? "") && h === 12) h = 0
  return `${String(h).padStart(2, "0")}:${m[2]}`
}

function HotelsCardView({ card, messageId, states }: { card: HotelsCard; messageId: string; states: States }) {
  const actions = useCardActions(messageId, card, states)
  const stay = card.stay
  return (
    <CardShell
      icon={Hotel}
      className={shellWidth(card.items.length)}
      title={card.title}
      meta={stay ? `${fmtDay(stay.checkIn)} to ${fmtDay(stay.checkOut)}, ${stay.nights} ${stay.nights === 1 ? "night" : "nights"}, ${stay.guests} ${stay.guests === 1 ? "guest" : "guests"}` : undefined}
      footer={actions.pollable ? <PollFooter count={actions.selected.length} total={card.items.length} observer={actions.observer} onPoll={() => actions.setPolling(true)} openPollId={actions.openPollId} /> : undefined}
    >
      <Tiles count={card.items.length}>
        {card.items.map((item) => (
          <HotelTile
            key={item.key}
            item={item}
            area={card.area}
            state={states[item.key]}
            checked={actions.selected.includes(item.key)}
            onCheck={(on) => actions.toggle(item.key, on)}
            actions={actions}
          />
        ))}
      </Tiles>
      <Dialogs actions={actions} card={card} />
    </CardShell>
  )
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
}

// ── Transport ───────────────────────────────────────────────────────────

const MODE: Record<TransportMode, { icon: LucideIcon; label: string }> = {
  cab: { icon: Car, label: "Cab" },
  train: { icon: TrainFront, label: "Train" },
  bus: { icon: Bus, label: "Bus" },
  bike: { icon: Bike, label: "Scooter" },
  tuktuk: { icon: CarTaxiFront, label: "Tuk-tuk" },
  walk: { icon: Footprints, label: "Walk" },
  flight: { icon: Plane, label: "Flight" },
  ferry: { icon: Ship, label: "Ferry" },
  other: { icon: Navigation, label: "Other" },
}

function TransportRow({
  item,
  longest,
  state,
  checked,
  onCheck,
  actions,
  card,
}: {
  item: TransportItem
  longest: number
  state?: ItemState
  checked: boolean
  onCheck: (on: boolean) => void
  actions: ReturnType<typeof useCardActions>
  card: TransportCard
}) {
  const mode = MODE[item.mode] ?? MODE.other
  const Icon = mode.icon
  const pct = item.durationMin && longest ? Math.max(8, Math.round((item.durationMin / longest) * 100)) : 0
  return (
    <article className="grid gap-3 border bg-card p-3 sm:grid-cols-[2.5rem_1fr_auto]">
      <span className="hidden size-10 place-items-center bg-primary/20 text-brand sm:grid">
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Icon className="size-4 shrink-0 text-brand sm:hidden" />
          <h4 className="text-sm font-semibold">{item.title}</h4>
          {item.operator && <span className="text-xs text-muted-foreground">{item.operator}</span>}
          {item.tags.map((t) => (
            <span key={t} className="bg-primary px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-primary-foreground uppercase">
              {t}
            </span>
          ))}
        </div>

        {item.durationMin ? (
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-base font-semibold tabular-nums">{formatMinutes(item.durationMin)}</span>
            <span className="h-1.5 flex-1 bg-foreground/8" aria-hidden>
              <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {[item.distanceKm ? `${item.distanceKm} km` : null, item.route, item.departs && item.fromStop ? `leaves ${item.fromStop} at ${item.departs}` : item.departs ? `leaves at ${item.departs}` : null, item.arrives && item.toStop ? `arrives ${item.toStop} ${item.arrives}` : null]
            .filter(Boolean)
            .join(", ")}
        </p>

        {item.cost && (
          <p className="text-sm">
            <span className="font-medium">{item.cost}</span>{" "}
            <span className="text-[11px] text-muted-foreground">{item.costNote === "reported" ? "reported fare" : "rough estimate"}</span>
          </p>
        )}

        {(item.pros.length > 0 || item.cons.length > 0) && (
          <ul className="flex flex-wrap gap-1.5 text-[11px]">
            {item.pros.map((p) => (
              <li key={p} className="bg-primary/15 px-1.5 py-0.5 text-foreground">
                + {p}
              </li>
            ))}
            {item.cons.map((c) => (
              <li key={c} className="bg-foreground/8 px-1.5 py-0.5 text-muted-foreground">
                - {c}
              </li>
            ))}
          </ul>
        )}
        {item.note && <p className="text-[11px] leading-relaxed text-muted-foreground">{item.note}</p>}
        {item.source && <p className="text-[10px] tracking-wide text-muted-foreground/70 uppercase">Source: {item.source}</p>}
      </div>

      <div className={cn("flex items-center gap-2 sm:flex-col sm:items-end", actions.pollable ? "sm:justify-between" : "sm:justify-end")}>
        {actions.pollable && !actions.openPollId && <SelectBox checked={checked} onChange={onCheck} label={`Include ${item.title} in a poll`} />}
        <ItemAction
          state={state}
          observer={actions.observer}
          admin={actions.admin}
          onAdd={() => actions.startAdd(item.key, `${item.title}: ${card.from} to ${card.to}`, "transport", 1, to24(item.departs ?? ""))}
        />
      </div>
    </article>
  )
}

function TransportCardView({ card, messageId, states }: { card: TransportCard; messageId: string; states: States }) {
  const actions = useCardActions(messageId, card, states)
  const longest = Math.max(0, ...card.items.map((i) => i.durationMin ?? 0))
  return (
    <CardShell
      icon={RouteIcon}
      title={card.from && card.to ? `${card.from} to ${card.to}` : card.title}
      meta={card.distanceKm ? `${card.distanceKm} km by road` : undefined}
      footer={actions.pollable ? <PollFooter count={actions.selected.length} total={card.items.length} observer={actions.observer} onPoll={() => actions.setPolling(true)} openPollId={actions.openPollId} /> : undefined}
    >
      <div className="space-y-2 p-2">
        {card.items.map((item) => (
          <TransportRow
            key={item.key}
            item={item}
            longest={longest}
            state={states[item.key]}
            checked={actions.selected.includes(item.key)}
            onCheck={(on) => actions.toggle(item.key, on)}
            actions={actions}
            card={card}
          />
        ))}
      </div>
      <Dialogs actions={actions} card={card} />
    </CardShell>
  )
}

// ── Places ──────────────────────────────────────────────────────────────

function PlaceTile({
  item,
  state,
  checked,
  onCheck,
  actions,
}: {
  item: PlaceItem
  state?: ItemState
  checked: boolean
  onCheck: (on: boolean) => void
  actions: ReturnType<typeof useCardActions>
}) {
  return (
    <article className={TILE}>
      <div className="relative">
        <Photo src={item.image} icon={MapPinned} />
        {actions.pollable && !actions.openPollId && (
          <div className="absolute top-2 right-2">
            <SelectBox checked={checked} onChange={onCheck} label={`Include ${item.name} in a poll`} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h4 className="line-clamp-2 text-sm leading-snug font-semibold">{item.name}</h4>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <Rating rating={item.rating} reviews={item.reviews} />
          {item.category && <span>{item.category}</span>}
          {item.price && <span>{item.price}</span>}
        </div>
        {item.hours && <p className="text-[11px] text-muted-foreground">{item.hours}</p>}
        {item.distanceKm !== undefined && <p className="text-[11px] text-muted-foreground">{item.distanceKm} km from the centre</p>}
        {item.why && <p className="border-l-2 border-primary pl-2 text-xs leading-relaxed">{item.why}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <ItemAction state={state} observer={actions.observer} admin={actions.admin} onAdd={() => actions.startAdd(item.key, item.name, "place")} />
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-8 items-center justify-center text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
              aria-label={`Open ${item.name}`}
            >
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

function PlacesCardView({ card, messageId, states }: { card: PlacesCard; messageId: string; states: States }) {
  const actions = useCardActions(messageId, card, states)
  return (
    <CardShell
      icon={MapPinned}
      className={shellWidth(card.items.length)}
      title={card.title}
      footer={actions.pollable ? <PollFooter count={actions.selected.length} total={card.items.length} observer={actions.observer} onPoll={() => actions.setPolling(true)} openPollId={actions.openPollId} /> : undefined}
    >
      <Tiles count={card.items.length}>
        {card.items.map((item) => (
          <PlaceTile
            key={item.key}
            item={item}
            state={states[item.key]}
            checked={actions.selected.includes(item.key)}
            onCheck={(on) => actions.toggle(item.key, on)}
            actions={actions}
          />
        ))}
      </Tiles>
      <Dialogs actions={actions} card={card} />
    </CardShell>
  )
}

// ── Entry point ─────────────────────────────────────────────────────────

export function AiCards({ cards, messageId, states }: { cards: ChatCard[]; messageId: string; states: States }) {
  return (
    <>
      {cards.map((card) =>
        card.type === "hotels" ? (
          <HotelsCardView key={card.id} card={card} messageId={messageId} states={states} />
        ) : card.type === "transport" ? (
          <TransportCardView key={card.id} card={card} messageId={messageId} states={states} />
        ) : (
          <PlacesCardView key={card.id} card={card} messageId={messageId} states={states} />
        )
      )}
    </>
  )
}
