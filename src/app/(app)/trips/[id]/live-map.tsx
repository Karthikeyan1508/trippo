"use client"

import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type * as LeafletNS from "leaflet"
import { toast } from "sonner"
import {
  Navigation,
  Loader2,
  Trash2,
  Radio,
  MapPinOff,
  MapPin,
  BedDouble,
  UtensilsCrossed,
  Handshake,
  TriangleAlert,
  ShieldCheck,
  BellRing,
  type LucideIcon,
} from "lucide-react"

import {
  getLiveData,
  addCheckpoint,
  removeCheckpoint,
  type LiveMember,
  type LiveCheckpoint,
} from "@/server/location"
import { Button } from "@/components/ui/button"
import { useMyLocation } from "@/components/location-provider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const CP_ICONS: Record<string, LucideIcon> = {
  POINT: MapPin,
  STAY: BedDouble,
  FOOD: UtensilsCrossed,
  MEETING: Handshake,
  DANGER: TriangleAlert,
}
const CP_TYPES = [
  { value: "POINT", label: "Point of interest" },
  { value: "STAY", label: "Stay" },
  { value: "FOOD", label: "Food" },
  { value: "MEETING", label: "Meeting point" },
  { value: "DANGER", label: "Caution" },
]
const PIN_PLACEMENT_ZOOM = 18

function CpIcon({ type, className }: { type: string; className?: string }) {
  const Icon = CP_ICONS[type] ?? MapPin
  return <Icon className={className} />
}

function cpMarkerSvg(type: string) {
  const Icon = CP_ICONS[type] ?? MapPin
  return renderToStaticMarkup(
    <Icon size={16} color="currentColor" strokeWidth={2.25} />
  )
}

function relTime(iso: string | null) {
  if (!iso) return "never"
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** Why a crew member's pin is greyed out. */
function offLabel(reason: string | null) {
  if (reason === "denied") return "Location blocked"
  if (reason === "unavailable") return "Location off"
  return "Offline"
}

function initials(name: string | null, id: string) {
  const s = name || id
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  )
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export function LiveMap({
  tripId,
  initialCenter,
  canEdit,
}: {
  tripId: string
  initialCenter: { lat: number; lng: number } | null
  canEdit: boolean
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<LeafletNS.Map | null>(null)
  const LRef = React.useRef<typeof LeafletNS | null>(null)
  const membersLayerRef = React.useRef<LeafletNS.LayerGroup | null>(null)
  const cpLayerRef = React.useRef<LeafletNS.LayerGroup | null>(null)
  const markersRef = React.useRef<Map<string, LeafletNS.Marker>>(new Map())
  const centeredRef = React.useRef(false)
  const announcedCheckpointRef = React.useRef<string | null>(null)

  const [ready, setReady] = React.useState(false)
  const [members, setMembers] = React.useState<LiveMember[]>([])
  const [checkpoints, setCheckpoints] = React.useState<LiveCheckpoint[]>([])
  const { status: myStatus, position: myPosition, openHelp } = useMyLocation()
  const [pending, setPending] = React.useState<{ lat: number; lng: number } | null>(
    null
  )
  const [placingPin, setPlacingPin] = React.useState<{ lat: number; lng: number } | null>(null)
  const [pendingName, setPendingName] = React.useState("")
  const [pendingType, setPendingType] = React.useState("POINT")
  const [savingCp, setSavingCp] = React.useState(false)

  async function refetch() {
    const r = await getLiveData(tripId)
    if (r.ok) {
      setMembers(r.members)
      setCheckpoints(r.checkpoints)
    }
  }

  // Initialise the Leaflet map (client-only).
  React.useEffect(() => {
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

      LRef.current = L
      const center: [number, number] = initialCenter
        ? [initialCenter.lat, initialCenter.lng]
        : [20, 78]
      const map = L.map(containerRef.current).setView(center, initialCenter ? 12 : 4)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map)
      membersLayerRef.current = L.layerGroup().addTo(map)
      cpLayerRef.current = L.layerGroup().addTo(map)
      if (canEdit) {
        map.on("click", (e: LeafletNS.LeafletMouseEvent) => {
          setPlacingPin({ lat: e.latlng.lat, lng: e.latlng.lng })
          if (map.getZoom() < PIN_PLACEMENT_ZOOM) {
            map.flyTo(e.latlng, PIN_PLACEMENT_ZOOM, { duration: 0.45 })
          }
        })
      }
      mapRef.current = map
      setReady(true)
    }
    init()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [initialCenter, canEdit])

  // A pin is deliberately placed only after the person has zoomed in and confirmed it.
  React.useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!ready || !L || !map || !placingPin) return
    const marker = L.marker([placingPin.lat, placingPin.lng], {
      draggable: true,
      zIndexOffset: 1_000,
      icon: L.divIcon({
        className: "",
        html: `<div class="tp-cp tp-cp-draft">${cpMarkerSvg("POINT")}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 32],
      }),
    }).addTo(map)
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng()
      setPlacingPin({ lat, lng })
    })
    return () => {
      marker.remove()
    }
  }, [placingPin, ready])

  // Poll live data every 5s.
  React.useEffect(() => {
    let active = true
    const run = async () => {
      const r = await getLiveData(tripId)
      if (active && r.ok) {
        setMembers(r.members)
        setCheckpoints(r.checkpoints)
      }
    }
    run()
    const t = setInterval(run, 5000)
    return () => {
      active = false
      clearInterval(t)
    }
  }, [tripId])

  // Draw member markers: live people in full colour, everyone else greyed out
  // at the last place they were seen.
  React.useEffect(() => {
    const L = LRef.current
    const layer = membersLayerRef.current
    if (!ready || !L || !layer) return
    layer.clearLayers()
    markersRef.current.clear()
    for (const m of members) {
      if (m.lat === null || m.lng === null) continue
      const off = m.status !== "live"
      const inner = m.image
        ? `<img src="${escapeHtml(m.image)}" alt="" />`
        : `<span>${initials(m.name, m.userId)}</span>`
      const html = `<div class="tp-pin ${m.isMe ? "tp-pin-me" : ""} ${off ? "tp-pin-off" : ""}">${inner}</div>`
      const icon = L.divIcon({
        className: "",
        html,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      })
      const popup = off
        ? `${escapeHtml(m.name ?? "Member")}${m.isMe ? " (you)" : ""}<br/>${offLabel(m.offReason)} · last seen ${relTime(m.updatedAt)}`
        : `${escapeHtml(m.name ?? "Member")}${m.isMe ? " (you)" : ""}<br/>Live · ${relTime(m.updatedAt)}`
      const marker = L.marker([m.lat, m.lng], { icon, zIndexOffset: off ? 0 : 500 })
        .addTo(layer)
        .bindPopup(popup)
      markersRef.current.set(m.userId, marker)
    }
    const located = members.filter((x) => x.lat !== null && x.lng !== null)
    if (!centeredRef.current && !initialCenter && located.length > 0 && mapRef.current) {
      const me = located.find((x) => x.isMe) ?? located[0]
      mapRef.current.setView([me.lat as number, me.lng as number], 13)
      centeredRef.current = true
    }
  }, [members, ready, initialCenter])

  function focusMember(m: LiveMember) {
    if (m.lat === null || m.lng === null || !mapRef.current) return
    mapRef.current.flyTo([m.lat, m.lng], Math.max(mapRef.current.getZoom(), 15), { duration: 0.8 })
    markersRef.current.get(m.userId)?.openPopup()
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  // Draw checkpoint markers.
  React.useEffect(() => {
    const L = LRef.current
    const layer = cpLayerRef.current
    if (!ready || !L || !layer) return
    layer.clearLayers()
    for (const c of checkpoints) {
      const icon = L.divIcon({
        className: "",
        html: `<div class="tp-cp${
          c.type === "DANGER" ? " tp-cp-danger" : ""
        }">${cpMarkerSvg(c.type)}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 28],
      })
      L.marker([c.lat, c.lng], { icon })
        .addTo(layer)
        .bindPopup(`<b>${escapeHtml(c.name)}</b>`)
    }
  }, [checkpoints, ready])

  // The saved checkpoint within 150 m of this device, if any.
  const nearbyCheckpoint = React.useMemo(
    () =>
      myPosition
        ? (checkpoints.find((checkpoint) => distanceMeters(myPosition, checkpoint) <= 150) ?? null)
        : null,
    [myPosition, checkpoints]
  )

  // Centre on this device the first time it reports, and show it on the crew map right away.
  React.useEffect(() => {
    if (!myPosition) return
    if (mapRef.current && !centeredRef.current) {
      mapRef.current.setView([myPosition.lat, myPosition.lng], 14)
      centeredRef.current = true
    }
    let active = true
    getLiveData(tripId).then((r) => {
      if (active && r.ok) {
        setMembers(r.members)
        setCheckpoints(r.checkpoints)
      }
    })
    return () => {
      active = false
    }
  }, [myPosition, tripId])

  // Heads-up when arriving near a saved checkpoint.
  React.useEffect(() => {
    if (!nearbyCheckpoint) {
      announcedCheckpointRef.current = null
      return
    }
    if (announcedCheckpointRef.current === nearbyCheckpoint.id) return
    announcedCheckpointRef.current = nearbyCheckpoint.id
    const danger = nearbyCheckpoint.type === "DANGER"
    const title = danger ? "Caution checkpoint nearby" : `Arriving near ${nearbyCheckpoint.name}`
    const body = danger
      ? "Take a moment to check in with your group."
      : "You’re within 150 metres of this trip checkpoint."
    toast(title, { description: body })
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body })
    }
  }, [nearbyCheckpoint])

  async function saveCheckpoint() {
    if (!pending) return
    setSavingCp(true)
    const res = await addCheckpoint(
      tripId,
      pendingName,
      pending.lat,
      pending.lng,
      pendingType as "POINT" | "STAY" | "FOOD" | "MEETING" | "DANGER"
    )
    setSavingCp(false)
    if (res.ok) {
      setPending(null)
      toast.success("Pin added")
      refetch()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="space-y-4">
      <style>{`
        .tp-pin{width:40px;height:40px;border-radius:0;overflow:hidden;border:3px solid #10b981;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.35);display:grid;place-items:center;font-weight:600;font-size:12px;color:#111}
        .tp-pin img{display:block;width:100%;height:100%;max-width:none;flex:none;object-fit:cover;object-position:center}
        .tp-pin{position:relative}
        .tp-pin-me{border-color:#2563eb}
        .tp-pin-off{border-color:#9ca3af;border-style:dashed;opacity:.7}
        .tp-pin-off img,.tp-pin-off span{filter:grayscale(1)}
        .tp-pin-off::after{content:"";position:absolute;inset:0;background:linear-gradient(to top right,transparent calc(50% - 1.5px),#ef4444 calc(50% - 1.5px),#ef4444 calc(50% + 1.5px),transparent calc(50% + 1.5px))}
        .tp-cp{width:30px;height:30px;border-radius:0;background:var(--primary);color:var(--primary-foreground);border:2px solid #fff;display:grid;place-items:center;box-shadow:0 1px 5px rgba(0,0,0,.35);cursor:pointer}
        .tp-cp svg{width:16px;height:16px}
        .tp-cp-danger{background:#dc2626;color:#fff}
        .tp-cp-draft{background:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.22),0 1px 5px rgba(0,0,0,.35)}
        .leaflet-container{font:inherit}
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 border bg-card p-4">
        <div className="flex items-center gap-3">
          <div
            className={`grid size-9 place-items-center ${
              myStatus === "live" || myStatus === "starting"
                ? "bg-primary/20 text-brand"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {myStatus === "live" || myStatus === "starting" ? (
              <Radio className="size-5" />
            ) : (
              <MapPinOff className="size-5" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">
              {myStatus === "live"
                ? "Sharing your live location"
                : myStatus === "starting"
                  ? "Waiting for your device's location…"
                  : "Your location is off"}
            </p>
            <p className="text-xs text-muted-foreground">
              {myStatus === "live"
                ? "On for as long as Trippo is open on this device. Visible to this crew only."
                : myStatus === "starting"
                  ? "Allow location when your browser asks."
                  : "Your crew sees where you were last, greyed out."}
            </p>
          </div>
        </div>
        {myStatus === "live" ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        ) : myStatus !== "starting" ? (
          <Button size="sm" onClick={openHelp}>
            Allow location
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600"><ShieldCheck className="size-5" /></div>
          <div><p className="text-sm font-medium">Checkpoint awareness</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">We’ll alert this device within 150m of a saved checkpoint while location sharing is on.</p></div>
        </div>
        <div className={`flex items-start gap-3 rounded-xl border p-4 ${nearbyCheckpoint?.type === "DANGER" ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}>
          <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${nearbyCheckpoint ? "bg-primary/10 text-brand" : "bg-muted text-muted-foreground"}`}><BellRing className="size-5" /></div>
          <div><p className="text-sm font-medium">{nearbyCheckpoint ? `Near ${nearbyCheckpoint.name}` : "No nearby checkpoint"}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{nearbyCheckpoint?.type === "DANGER" ? "Caution zone. Check in with the group." : nearbyCheckpoint ? "You’re inside the checkpoint radius." : "Your next proximity update will appear here."}</p></div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative z-0 h-[420px] w-full overflow-hidden rounded-xl border bg-muted"
      />
      {placingPin && canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 border bg-card p-3">
          <div>
            <p className="text-sm font-medium">Place pin precisely</p>
            <p className="text-xs text-muted-foreground">Zoom in or drag the blue pin to the exact spot, then continue.</p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{placingPin.lat.toFixed(5)}, {placingPin.lng.toFixed(5)}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPlacingPin(null)}>Cancel</Button>
            <Button size="sm" onClick={() => {
              setPendingName("")
              setPendingType("POINT")
              setPending(placingPin)
              setPlacingPin(null)
            }}>Use this location</Button>
          </div>
        </div>
      )}
      {canEdit && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Navigation className="size-3.5" />
          Tap the map to place a checkpoint precisely.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border bg-card p-4">
          <p className="mb-2 text-sm font-medium">Crew on the map</p>
          <ul className="space-y-1">
            {[...members]
              .sort((x, y) => Number(y.status === "live") - Number(x.status === "live"))
              .map((m) => {
                const off = m.status !== "live"
                const canFocus = m.lat !== null && m.lng !== null
                return (
                  <li key={m.userId}>
                    <button
                      type="button"
                      disabled={!canFocus}
                      onClick={() => focusMember(m)}
                      className={`flex w-full items-center justify-between gap-3 px-1 py-1.5 text-left text-sm ${
                        canFocus ? "hover:bg-foreground/5" : "cursor-default"
                      } ${off ? "text-muted-foreground" : ""}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {m.status === "live" ? (
                          <span className="size-2 shrink-0 animate-pulse bg-emerald-500" />
                        ) : m.status === "off" ? (
                          <MapPinOff className="size-3.5 shrink-0" />
                        ) : (
                          <span className="size-2 shrink-0 border border-muted-foreground/50" />
                        )}
                        <span className={`truncate ${off ? "line-through decoration-muted-foreground/40" : ""}`}>
                          {m.name ?? "Member"}
                        </span>
                        {m.isMe && <span className="text-xs">(you)</span>}
                      </span>
                      <span className="shrink-0 text-xs">
                        {m.status === "live"
                          ? `Live · ${relTime(m.updatedAt)}`
                          : m.status === "off"
                            ? `${offLabel(m.offReason)} · last seen ${relTime(m.updatedAt)}`
                            : "Not shared yet"}
                      </span>
                    </button>
                  </li>
                )
              })}
          </ul>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-medium">Checkpoints</p>
          {checkpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pins yet.{canEdit ? " Tap the map to add one." : ""}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {checkpoints.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    <CpIcon
                      type={c.type}
                      className={`size-4 shrink-0 ${
                        c.type === "DANGER" ? "text-destructive" : "text-brand"
                      }`}
                    />
                    {c.name}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() =>
                        removeCheckpoint(c.id).then((r) => {
                          if (r.ok) refetch()
                          else toast.error(r.error)
                        })
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove pin"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a checkpoint</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                placeholder="e.g. Meet at the beach shack"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={pendingType} onValueChange={setPendingType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CP_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <CpIcon
                        type={t.value}
                        className="size-4 text-muted-foreground"
                      />
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveCheckpoint} disabled={savingCp} className="gap-2">
              {savingCp && <Loader2 className="size-4 animate-spin" />}
              Add pin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
