"use client"

import * as React from "react"
import { animate, createTimeline, stagger, utils } from "animejs"
import { BarChart3, Check, Hotel, MessagesSquare, Plus, Star } from "lucide-react"

/**
 * A looping, scripted slice of the real crew chat: someone asks @trippo for hotels, Trippo works,
 * cards arrive, the crew starts a poll and votes come in. It plays while on screen and rests
 * on the finished state for people who prefer reduced motion.
 */

const QUESTION = "@trippo top 3 hotels near Colombo"
const STEPS = ["Searching hotels near Colombo", "Reading ratings and prices", "Ranking by reviews, not just stars"]
const HOTELS = [
  { name: "Cinnamon Grand", rating: 4.7, price: 9846, badge: "Top rated", votes: 58 },
  { name: "Amari Colombo", rating: 4.7, price: 13314, badge: "Best value", votes: 28 },
  { name: "Galle Face Hotel", rating: 4.4, price: 12500, badge: "Closest", votes: 14 },
]

function Avatar({ letter, tone = "muted" }: { letter: string; tone?: "muted" | "primary" }) {
  return (
    <span className={"grid size-8 shrink-0 place-items-center text-xs font-semibold " + (tone === "primary" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
      {letter}
    </span>
  )
}

export function ChatDemo() {
  const root = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = root.current
    if (!el) return
    const q = <T extends Element = HTMLElement>(sel: string) => Array.from(el.querySelectorAll<T>(sel))
    const one = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Rest on the finished conversation: no working steps, no toast.
      utils.set(one("[data-think]"), { display: "none" })
      utils.set(one("[data-toast]"), { display: "none" })
      utils.set(one("[data-caret]"), { display: "none" })
      return
    }

    const typedEl = one("[data-typed]")
    const caret = one("[data-caret]")
    const steps = q("[data-step]")
    const ticks = q("[data-tick]")
    const spinners = q("[data-spin]")
    const cards = q("[data-card]")
    const prices = q("[data-price]")
    const ratings = q("[data-rating]")
    const bars = q("[data-bar]")
    const pcts = q("[data-pct]")

    const hide = () => {
      utils.set(q("[data-m]"), { opacity: 0, translateY: 14 })
      utils.set(cards, { opacity: 0, translateY: 22 })
      utils.set(steps, { opacity: 0, translateX: -10 })
      utils.set(ticks, { opacity: 0, scale: 0.4 })
      utils.set(spinners, { opacity: 1 })
      utils.set(one("[data-answer]"), { opacity: 0, translateY: 10 })
      utils.set(one("[data-think]"), { opacity: 1, height: "auto" })
      utils.set(bars, { scaleX: 0 })
      utils.set(one("[data-poll]"), { opacity: 0, translateY: 16 })
      utils.set(one("[data-toast]"), { opacity: 0, translateY: 12 })
      caret.style.display = ""
      typedEl.textContent = ""
      prices.forEach((p) => (p.textContent = "₹0"))
      ratings.forEach((r) => (r.textContent = "0.0"))
      pcts.forEach((p) => (p.textContent = "0%"))
    }
    hide()

    const typed = { n: 0 }
    const money = HOTELS.map(() => ({ n: 0 }))
    const stars = HOTELS.map(() => ({ n: 0 }))
    const votes = HOTELS.map(() => ({ n: 0 }))

    const tl = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 650 } })
    tl.add("[data-m='1']", { opacity: [0, 1], translateY: [14, 0] }, 300)
      .add("[data-m='2']", { opacity: [0, 1], translateY: [14, 0] }, 1300)
      .add(typed, { n: [0, QUESTION.length], duration: 1500, ease: "linear", onUpdate: () => (typedEl.textContent = QUESTION.slice(0, Math.round(typed.n))) }, 1700)
      .call(() => (caret.style.display = "none"), 3250)
      .add("[data-m='3']", { opacity: [0, 1], translateY: [14, 0] }, 3500)
    steps.forEach((s, i) => {
      tl.add(s, { opacity: [0, 1], translateX: [-10, 0], duration: 400 }, 3900 + i * 650)
      tl.add(spinners[i], { opacity: [1, 0], duration: 200 }, 4350 + i * 650)
      tl.add(ticks[i], { opacity: [0, 1], scale: [0.4, 1], duration: 300 }, 4350 + i * 650)
    })
    tl.add(one("[data-think]"), { opacity: [1, 0], duration: 300 }, 6000)
      .add(one("[data-answer]"), { opacity: [0, 1], translateY: [10, 0], duration: 600 }, 6250)
      .add(cards, { opacity: [0, 1], translateY: [22, 0], delay: stagger(140), duration: 800 }, 6500)
    HOTELS.forEach((h, i) => {
      tl.add(money[i], { n: [0, h.price], duration: 1300, onUpdate: () => (prices[i].textContent = `₹${Math.round(money[i].n).toLocaleString("en-IN")}`) }, 6800 + i * 140)
      tl.add(stars[i], { n: [0, h.rating], duration: 1100, onUpdate: () => (ratings[i].textContent = stars[i].n.toFixed(1)) }, 6800 + i * 140)
    })
    tl.add(one("[data-poll]"), { opacity: [0, 1], translateY: [16, 0], duration: 700 }, 9300)
    HOTELS.forEach((h, i) => {
      tl.add(votes[i], { n: [0, h.votes], duration: 1400, onUpdate: () => (pcts[i].textContent = `${Math.round(votes[i].n)}%`) }, 9900 + i * 120)
      tl.add(bars[i], { scaleX: [0, h.votes / 100], duration: 1400 }, 9900 + i * 120)
    })
    tl.add(one("[data-toast]"), { opacity: [0, 1], translateY: [12, 0], duration: 500 }, 11400)
      .add(one("[data-toast]"), { opacity: [1, 0], duration: 400 }, 13400)

    let timer = 0
    tl.onComplete = () => {
      timer = window.setTimeout(() => {
        hide()
        tl.restart()
      }, 2600)
    }

    const caretBlink = animate(caret, { opacity: [1, 0.15], duration: 520, ease: "linear", alternate: true, loop: true })

    let visible = false
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        if (visible) tl.play()
        else tl.pause()
      },
      { threshold: 0.35 }
    )
    io.observe(el)

    return () => {
      io.disconnect()
      window.clearTimeout(timer)
      tl.revert()
      caretBlink.revert()
    }
  }, [])

  return (
    <div ref={root} className="relative border bg-card shadow-2xl shadow-black/10 dark:shadow-black/50">
      <div className="flex h-12 items-center gap-3 border-b px-4">
        <span className="grid size-8 place-items-center bg-primary/20 text-brand">
          <MessagesSquare className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Crew chat</p>
          <p className="truncate text-[11px] text-muted-foreground">3 people and Trippo, planning Sri Lanka</p>
        </div>
        <div className="ml-auto flex -space-x-1.5">
          {["R", "A", "M"].map((l) => (
            <span key={l} className="grid size-6 place-items-center border-2 border-card bg-muted text-[10px] font-medium text-muted-foreground">
              {l}
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-[34rem] space-y-3 p-4 sm:min-h-[36rem]">
        <div data-m="1" className="flex gap-2.5">
          <Avatar letter="R" />
          <div>
            <p className="mb-1 text-xs font-medium">Riya</p>
            <p className="border bg-card/80 px-3 py-2 text-sm">Where should we stay in Colombo?</p>
          </div>
        </div>

        <div data-m="2" className="flex flex-row-reverse gap-2.5">
          <div className="flex flex-col items-end">
            <p className="min-h-9 border border-primary/30 bg-primary/15 px-3 py-2 text-sm">
              <span data-typed>{QUESTION}</span>
              <span data-caret className="ml-px inline-block h-4 w-0.5 translate-y-0.5 bg-foreground" />
            </p>
          </div>
        </div>

        <div data-m="3" className="flex gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center bg-primary text-primary-foreground">
            <Hotel className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center gap-2 text-xs">
              <span className="font-medium">Trippo</span>
              <span className="bg-primary/20 px-1 py-px text-[9px] font-semibold tracking-wider text-brand uppercase">AI</span>
            </p>

            <div className="grid">
            <div data-think className="col-start-1 row-start-1 space-y-1.5 self-start border border-l-2 border-l-primary bg-card/80 px-3 py-2.5">
              {STEPS.map((s) => (
                <p key={s} data-step className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="relative grid size-3.5 place-items-center">
                    <span data-spin className="absolute size-3 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-brand" />
                    <Check data-tick className="size-3.5 text-brand" />
                  </span>
                  {s}
                </p>
              ))}
            </div>

            <div data-answer className="col-start-1 row-start-1 self-start border border-l-2 border-l-primary bg-card/80 px-3 py-2.5 text-sm">
              Three strong picks. Cinnamon Grand has the best mix of rating, price and location.
            </div>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {HOTELS.map((h) => (
                <article key={h.name} data-card className="flex flex-col border bg-card">
                  <div className="relative h-20 overflow-hidden bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary),transparent_55%),color-mix(in_oklch,var(--chart-3,var(--primary)),transparent_75%))]">
                    <Hotel className="absolute right-2 bottom-1 size-10 text-foreground/15" />
                    <span className="absolute top-1.5 left-1.5 bg-primary px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-primary-foreground uppercase">{h.badge}</span>
                  </div>
                  <div className="space-y-1 p-2.5">
                    <p className="line-clamp-1 text-xs font-semibold">{h.name}</p>
                    <p className="flex items-center gap-1 text-[11px]">
                      <Star className="size-3 fill-amber-400 text-amber-400" />
                      <span data-rating className="font-medium tabular-nums">
                        {h.rating.toFixed(1)}
                      </span>
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      <span data-price>₹{h.price.toLocaleString("en-IN")}</span>
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">per night</span>
                    </p>
                    <p className="inline-flex items-center gap-1 border px-1.5 py-1 text-[10px] font-medium">
                      <Plus className="size-3" />
                      Add to itinerary
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <div data-poll className="mt-3 border bg-card">
              <p className="flex items-center gap-2 border-b px-3 py-1.5 text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                <BarChart3 className="size-3.5 text-brand" />
                Poll
                <span className="ml-auto tracking-normal normal-case">Closes in 24 hours</span>
              </p>
              <div className="space-y-1.5 p-3">
                <p className="text-sm font-semibold">Where should we stay near Colombo?</p>
                {HOTELS.map((h) => (
                  <div key={h.name} className="relative overflow-hidden border">
                    <span data-bar className="absolute inset-y-0 left-0 w-full origin-left bg-primary/20" />
                    <span className="relative flex items-center justify-between px-2.5 py-1.5 text-xs">
                      <span className="font-medium">{h.name}</span>
                      <span data-pct className="text-muted-foreground tabular-nums">
                        {h.votes}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div data-toast className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 border border-primary/40 bg-card px-3 py-2 text-xs font-medium shadow-lg">
        <Check className="size-3.5 text-brand" />
        Poll started. The crew has been told.
      </div>
    </div>
  )
}
