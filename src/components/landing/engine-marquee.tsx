"use client"

import * as React from "react"
import { animate } from "animejs"
import { BedDouble, Compass, Images, MapPinned, Plane, Route, Search, ShoppingBag, Store, Ticket, Video, type LucideIcon } from "lucide-react"

/** The SerpApi engines behind Trippo, drifting past in two lanes. Hover to hold still. */

const ENGINES: { engine: string; label: string; icon: LucideIcon }[] = [
  { engine: "google_flights", label: "Flights", icon: Plane },
  { engine: "google_hotels", label: "Hotels", icon: BedDouble },
  { engine: "google_maps", label: "Places", icon: MapPinned },
  { engine: "google_maps_directions", label: "Directions", icon: Route },
  { engine: "google_local", label: "Local food", icon: Store },
  { engine: "youtube", label: "Videos", icon: Video },
  { engine: "google_images", label: "Photos", icon: Images },
  { engine: "google_events", label: "Events", icon: Ticket },
  { engine: "google", label: "Answers", icon: Search },
  { engine: "amazon", label: "Gear", icon: ShoppingBag },
]

function Lane({ items, reverse, duration }: { items: typeof ENGINES; reverse?: boolean; duration: number }) {
  const track = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = track.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const run = animate(el, { translateX: reverse ? ["-50%", "0%"] : ["0%", "-50%"], duration, ease: "linear", loop: true })
    const hold = () => run.pause()
    const go = () => run.play()
    el.parentElement?.addEventListener("pointerenter", hold)
    el.parentElement?.addEventListener("pointerleave", go)
    return () => {
      el.parentElement?.removeEventListener("pointerenter", hold)
      el.parentElement?.removeEventListener("pointerleave", go)
      run.revert()
    }
  }, [reverse, duration])

  return (
    <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div ref={track} className="flex w-max gap-3 will-change-transform">
        {[...items, ...items].map((e, i) => (
          <div key={i} className="flex shrink-0 items-center gap-3 border bg-card/80 px-4 py-3 backdrop-blur-md" aria-hidden={i >= items.length}>
            <span className="grid size-9 place-items-center bg-primary/20 text-brand">
              <e.icon className="size-[18px]" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{e.label}</span>
              <span className="block font-mono text-[11px] text-muted-foreground">{e.engine}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EngineMarquee() {
  const half = Math.ceil(ENGINES.length / 2)
  const first = [...ENGINES.slice(0, half), ...ENGINES.slice(half)]
  const second = [...ENGINES.slice(half), ...ENGINES.slice(0, half)]
  return (
    <div className="space-y-3">
      <Lane items={first} duration={42000} />
      <Lane items={second} reverse duration={50000} />
      <span className="sr-only">
        <Compass /> Engines used: {ENGINES.map((e) => e.engine).join(", ")}
      </span>
    </div>
  )
}
