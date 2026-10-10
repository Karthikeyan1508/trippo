"use client"

import * as React from "react"
import type * as LeafletNS from "leaflet"
import { MapPinned } from "lucide-react"

import { activityIconSvg } from "@/components/activity-icon"

export type MapStop = {
  n: number
  lat: number
  lng: number
  title: string
  iconKey: string
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  )
}

export function ItineraryMap({ stops }: { stops: MapStop[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<LeafletNS.Map | null>(null)

  React.useEffect(() => {
    if (stops.length === 0) return
    let cancelled = false

    async function init() {
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link")
        link.id = "leaflet-css"
        link.rel = "stylesheet"
        link.href =
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
        document.head.appendChild(link)
      }
      const mod = await import("leaflet")
      const L = ((mod as unknown as { default?: typeof LeafletNS }).default ??
        mod) as typeof LeafletNS
      if (cancelled || !containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, { scrollWheelZoom: false })
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map)

      // Stops that share a spot (the airport at both ends of a trip) get one marker with all
      // their numbers, instead of badges stacked on top of each other.
      const spots = new Map<string, MapStop[]>()
      for (const s of stops) {
        const key = `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`
        spots.set(key, [...(spots.get(key) ?? []), s])
      }
      const latlngs: [number, number][] = []
      for (const group of spots.values()) {
        const s = group[0]
        latlngs.push([s.lat, s.lng])
        const label = group.map((g) => g.n).join(", ")
        const icon = L.divIcon({
          className: "",
          html: `<div class="tp-stop">${activityIconSvg(s.iconKey, {
            color: "currentColor",
            size: 16,
            strokeWidth: 2.25,
          })}<span class="tp-n">${label}</span></div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })
        L.marker([s.lat, s.lng], { icon })
          .addTo(map)
          .bindPopup(group.map((g) => `<b>${g.n}.</b> ${escapeHtml(g.title)}`).join("<br>"))
      }

      if (latlngs.length === 1) {
        map.setView(latlngs[0], 13)
      } else {
        map.fitBounds(L.latLngBounds(latlngs).pad(0.2))
      }
      mapRef.current = map
    }

    init()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [stops])

  if (stops.length === 0) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/50 text-center xl:h-[420px]">
        <MapPinned className="size-7 text-muted-foreground" />
        <p className="max-w-[15rem] text-sm text-muted-foreground">
          The map fills in once the plan includes located places.
        </p>
      </div>
    )
  }

  return (
    <>
      <style>{`
        .tp-stop{position:relative;width:32px;height:32px;border-radius:0;background:var(--primary);color:var(--primary-foreground);border:2px solid #fff;display:grid;place-items:center;box-shadow:0 1px 5px rgba(0,0,0,.35)}
        .tp-stop svg{width:16px;height:16px}
        .tp-n{position:absolute;top:-8px;left:18px;min-width:16px;height:16px;padding:0 4px;white-space:nowrap;border-radius:0;background:var(--primary-foreground);color:var(--primary);font-size:10px;font-weight:700;display:grid;place-items:center;border:1.5px solid #fff}
        .leaflet-container{font:inherit}
      `}</style>
      <div
        ref={containerRef}
        className="z-0 h-[300px] w-full overflow-hidden rounded-xl border bg-muted xl:h-[min(640px,calc(100svh-8rem))]"
      />
    </>
  )
}
