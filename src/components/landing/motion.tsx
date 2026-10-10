"use client"

import * as React from "react"
import { animate, stagger, utils } from "animejs"
import { cn } from "cn"

/**
 * Small animation building blocks for the landing page, all on anime.js. Each one leaves its
 * content fully visible until the browser has taken over (no hidden text without JavaScript),
 * and does nothing for people who prefer reduced motion.
 */

const prefersReduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Runs `onSeen` the first time the element is on screen. */
function useSeen(ref: React.RefObject<Element | null>, onSeen: () => void, margin = "0px 0px -12% 0px") {
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        onSeen()
      },
      { rootMargin: margin, threshold: 0.05 }
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** Fades and lifts its content (or each direct child, with `each`) into place as it scrolls into view. */
export function Reveal({
  children,
  className,
  each = false,
  delay = 0,
  distance = 28,
}: {
  children: React.ReactNode
  className?: string
  each?: boolean
  delay?: number
  distance?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const targets = React.useRef<Element[]>([])

  React.useEffect(() => {
    const el = ref.current
    if (!el || prefersReduced()) return
    targets.current = each ? Array.from(el.children) : [el]
    utils.set(targets.current, { opacity: 0, translateY: distance })
  }, [each, distance])

  useSeen(ref, () => {
    if (!targets.current.length) return
    animate(targets.current, {
      opacity: [0, 1],
      translateY: [distance, 0],
      duration: 900,
      delay: stagger(90, { start: delay }),
      ease: "outExpo",
    })
  })

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/** Counts up to a number when it scrolls into view. */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: {
  to: number
  prefix?: string
  suffix?: string
  decimals?: number
  className?: string
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const format = (n: number) => `${prefix}${n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`

  useSeen(ref, () => {
    const el = ref.current
    if (!el || prefersReduced()) return
    const state = { n: 0 }
    animate(state, {
      n: to,
      duration: 1600,
      ease: "outExpo",
      onUpdate: () => {
        el.textContent = format(state.n)
      },
    })
  })

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(to)}
    </span>
  )
}

/** The hero headline: each word rises out of a mask, one after the other. */
export function HeroWords({ lines, className }: { lines: { text: string; accent?: boolean }[]; className?: string }) {
  const ref = React.useRef<HTMLHeadingElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const words = el.querySelectorAll("[data-word]")
    if (prefersReduced()) {
      utils.set(words, { translateY: "0%" })
      return
    }
    const run = animate(words, {
      translateY: ["112%", "0%"],
      rotate: [4, 0],
      duration: 1100,
      delay: stagger(70, { start: 150 }),
      ease: "outExpo",
    })
    return () => {
      run.revert()
    }
  }, [])

  return (
    <h1 ref={ref} className={className} aria-label={lines.map((l) => l.text).join(" ")}>
      {lines.map((line, i) => (
        <span key={i} className="block" aria-hidden>
          {line.text.split(" ").map((word, j) => (
            <span key={j} className="mr-[0.22em] inline-block overflow-hidden align-bottom pb-[0.08em]">
              <span data-word className={cn("inline-block will-change-transform", line.accent && "text-brand")} style={{ transform: "translateY(112%)" }}>
                {word}
              </span>
            </span>
          ))}
        </span>
      ))}
    </h1>
  )
}

/** A card with a glow that follows the pointer. */
export function SpotlightCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const el = ref.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        el.style.setProperty("--mx", `${e.clientX - rect.left}px`)
        el.style.setProperty("--my", `${e.clientY - rect.top}px`)
      }}
      className={cn(
        "group relative overflow-hidden border bg-card transition-colors hover:border-foreground/30",
        "before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100",
        "before:bg-[radial-gradient(360px_circle_at_var(--mx,50%)_var(--my,50%),color-mix(in_oklch,var(--primary),transparent_78%),transparent_70%)]",
        className
      )}
    >
      <div className="relative">{children}</div>
    </div>
  )
}

/** A thin lime line under the header that fills as you read down the page. */
export function ScrollProgress() {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const bar = ref.current
    if (!bar) return
    let raf = 0
    const update = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      utils.set(bar, { scaleX: max > 0 ? Math.min(1, window.scrollY / max) : 0 })
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return <div ref={ref} className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-primary" aria-hidden />
}

/** Things that drift gently up and down, forever. */
export function Float({ children, className, amplitude = 8, duration = 4200, delay = 0 }: { children: React.ReactNode; className?: string; amplitude?: number; duration?: number; delay?: number }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = ref.current
    if (!el || prefersReduced()) return
    const run = animate(el, { translateY: [-amplitude, amplitude], duration, delay, ease: "inOutSine", alternate: true, loop: true })
    return () => {
      run.revert()
    }
  }, [amplitude, duration, delay])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
