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
  updateMyLocation,
  stopSharingLocation,
  addCheckpoint,
  removeCheckpoint,
  type LiveMember,
  type LiveCheckpoint,
} from "@/server/location"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
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

function relTime(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
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
  const watchRef = React.useRef<number | null>(null)
  const lastSentRef = React.useRef(0)
  const centeredRef = React.useRef(false)
  const announcedCheckpointRef = React.useRef<string | null>(null)

  const [ready, setReady] = React.useState(false)
  const [members, setMembers] = React.useState<LiveMember[]>([])
  const [checkpoints, setCheckpoints] = React.useState<LiveCheckpoint[]>([])
  const [sharing, setSharing] = React.useState(false)
  const [pending, setPending] = React.useState<{ lat: number; lng: number } | null>(
    null
  )
  const [pendingName, setPendingName] = React.useState("")
  const [pendingType, setPendingType] = React.useState("POINT")
  const [savingCp, setSavingCp] = React.useState(false)
  const [nearbyCheckpoint, setNearbyCheckpoint] = React.useState<LiveCheckpoint | null>(null)

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
          setPendingName("")
          setPendingType("POINT")
          setPending({ lat: e.latlng.lat, lng: e.latlng.lng })
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

  // Draw member markers.
  React.useEffect(() => {
    const L = LRef.current
    const layer = membersLayerRef.current
    if (!ready || !L || !layer) return
    layer.clearLayers()
    for (const m of members) {
      const html = m.image
        ? `<div class="tp-pin ${m.isMe ? "tp-pin-me" : ""}"><img src="${escapeHtml(
            m.image
          )}" alt="" /></div>`
        : `<div class="tp-pin ${m.isMe ? "tp-pin-me" : ""}"><span>${initials(
            m.name,
            m.userId
          )}</span></div>`
      const icon = L.divIcon({
        className: "",
        html,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      })
      L.marker([m.lat, m.lng], { icon })
        .addTo(layer)
        .bindPopup(
          `${escapeHtml(m.name ?? "Member")}${m.isMe ? " (you)" : ""}<br/>${relTime(
            m.updatedAt
          )}`
        )
    }
    if (!centeredRef.current && !initialCenter && members.length > 0 && mapRef.current) {
      const me = members.find((x) => x.isMe) ?? members[0]
      mapRef.current.setView([me.lat, me.lng], 13)
      centeredRef.current = true
    }
  }, [members, ready, initialCenter])

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

  // Location sharing via the Geolocation API.
  React.useEffect(() => {
    if (!sharing) return
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        if (mapRef.current && !centeredRef.current) {
          mapRef.current.setView([latitude, longitude], 14)
          centeredRef.current = true
        }
        const now = Date.now()
        const nearby = checkpoints.find((checkpoint) => distanceMeters({ lat: latitude, lng: longitude }, checkpoint) <= 150) ?? null
        setNearbyCheckpoint(nearby)
        if (nearby && announcedCheckpointRef.current !== nearby.id) {
          announcedCheckpointRef.current = nearby.id
          const title = nearby.type === "DANGER" ? "Caution checkpoint nearby" : `Arriving near ${nearby.name}`
          toast( title, { description: nearby.type === "DANGER" ? "Take a moment to check in with your group." : "You’re within 150 metres of this trip checkpoint." })
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body: nearby.type === "DANGER" ? "Take a moment to check in with your group." : "You’re within 150 metres of this trip checkpoint." })
          }
        }
        if (!nearby) announcedCheckpointRef.current = null
        if (now - lastSentRef.current < 8000) return
        lastSentRef.current = now
        updateMyLocation(tripId, latitude, longitude, accuracy).then(() => refetch())
      },
      (err) => {
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : "Couldn't get your location."
        )
        setSharing(false)
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    )
    return () => {
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, tripId, checkpoints])

  function toggleShare(v: boolean) {
    if (v && !("geolocation" in navigator)) {
      toast.error("Geolocation isn't supported in this browser.")
      return
    }
    setSharing(v)
    if (!v) {
      stopSharingLocation(tripId).then(() => refetch())
    }
  }

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
        .tp-pin img{width:100%;height:100%;object-fit:cover}
        .tp-pin-me{border-color:#2563eb}
        .tp-cp{width:30px;height:30px;border-radius:0;background:var(--primary);color:var(--primary-foreground);border:2px solid #fff;display:grid;place-items:center;box-shadow:0 1px 5px rgba(0,0,0,.35);cursor:pointer}
        .tp-cp svg{width:16px;height:16px}
        .tp-cp-danger{background:#dc2626;color:#fff}
        .leaflet-container{font:inherit}
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-brand">
            <Radio className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Share my live location</p>
            <p className="text-xs text-muted-foreground">
              Opt-in · visible to trip members only
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sharing && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>
          )}
          <Switch checked={sharing} onCheckedChange={toggleShare} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600"><ShieldCheck className="size-5" /></div>
          <div><p className="text-sm font-medium">Checkpoint awareness</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">We’ll alert this device within 150m of a saved checkpoint while location sharing is on.</p></div>
        </div>
        <div className={`flex items-start gap-3 rounded-xl border p-4 ${nearbyCheckpoint?.type === "DANGER" ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}>
          <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${nearbyCheckpoint ? "bg-primary/10 text-brand" : "bg-muted text-muted-foreground"}`}><BellRing className="size-5" /></div>
          <div><p className="text-sm font-medium">{nearbyCheckpoint ? `Near ${nearbyCheckpoint.name}` : "No nearby checkpoint"}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{nearbyCheckpoint?.type === "DANGER" ? "Caution zone — check in with the group." : nearbyCheckpoint ? "You’re inside the checkpoint radius." : "Your next proximity update will appear here."}</p></div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative z-0 h-[420px] w-full overflow-hidden rounded-xl border bg-muted"
      />
      {canEdit && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Navigation className="size-3.5" />
          Tap anywhere on the map to drop a checkpoint.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-medium">Who&apos;s sharing</p>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No one is sharing their location yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    {m.name ?? "Member"}
                    {m.isMe && (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {relTime(m.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
