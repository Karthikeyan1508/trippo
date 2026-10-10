"use client"

import * as React from "react"
import { animate, onScroll, stagger, utils } from "animejs"

const STEPS = [
  { title: "Invite", body: "Share one link in the group chat. Friends sign in and land straight on the trip." },
  { title: "Share", body: "Everyone answers a two minute form: diet, pace, budget, interests, access needs." },
  { title: "Plan", body: "Real places and real flights become a route first itinerary you can edit." },
  { title: "Approve", body: "Everyone votes. The plan locks the moment the whole crew agrees." },
  { title: "Go", body: "Prep, a live map, a shared budget, and a story of the trip to keep." },
]

/** The five stages as a rail that fills in as you scroll past it, each stop lighting up in turn. */
export function JourneyRail() {
  const root = React.useRef<HTMLOListElement>(null)

  React.useEffect(() => {
    const el = root.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const fills = Array.from(el.querySelectorAll<HTMLElement>("[data-fill]"))
    const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-node]"))
    const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-step]"))
    utils.set(fills, { scaleX: 0, scaleY: 0 })
    utils.set(cards, { opacity: 0, translateY: 24 })

    const sync = (target: HTMLElement) => onScroll({ target, sync: true, enter: "bottom 75%", leave: "top 35%" })
    const fillX = fills.filter((f) => f.dataset.axis === "x").map((f) => animate(f, { scaleX: [0, 1], ease: "linear", autoplay: sync(el) }))
    const fillY = fills.filter((f) => f.dataset.axis === "y").map((f) => animate(f, { scaleY: [0, 1], ease: "linear", autoplay: sync(el) }))
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        animate(cards, { opacity: [0, 1], translateY: [24, 0], delay: stagger(140), duration: 900, ease: "outExpo" })
        animate(nodes, { scale: [0.4, 1], duration: 700, delay: stagger(140), ease: "outBack" })
      },
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      ;[...fillX, ...fillY].forEach((f) => f.revert())
    }
  }, [])

  return (
    <ol ref={root} className="relative grid gap-8 lg:grid-cols-5 lg:gap-6">
      {/* The rail: across on wide screens, down the side on narrow ones. */}
      <span aria-hidden className="absolute top-3 bottom-3 left-[13px] w-px bg-border lg:top-[13px] lg:right-6 lg:bottom-auto lg:left-6 lg:h-px lg:w-auto" />
      <span data-fill data-axis="y" aria-hidden className="absolute top-3 bottom-3 left-[13px] w-px origin-top bg-primary lg:hidden" />
      <span data-fill data-axis="x" aria-hidden className="absolute inset-x-6 top-[13px] hidden h-px origin-left bg-primary lg:block" />
      {STEPS.map((s, i) => (
        <li key={s.title} className="relative pl-12 lg:pt-12 lg:pl-0">
          <span data-node className="absolute top-0 left-0 grid size-7 place-items-center bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
            {i + 1}
          </span>
          <div data-step>
            <h3 className="text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
