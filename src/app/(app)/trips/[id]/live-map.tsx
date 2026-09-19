"use client"

import * as React from "react"
import type * as LeafletNS from "leaflet"
import { toast } from "sonner"
import { Navigation, Loader2, Trash2, Radio } from "lucide-react"

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

const CP_EMOJI: Record<string, string> = {
  POINT: "📍",
  STAY: "🏨",
  FOOD: "🍽️",
  MEETING: "🤝",
  DANGER: "⚠️",
}
const CP_TYPES = [
  { value: "POINT", label: "Point of interest" },
  { value: "STAY", label: "Stay" },
  { value: "FOOD", label: "Food" },
  { value: "MEETING", label: "Meeting point" },
  { value: "DANGER", label: "Caution" },
]

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
        html: `<div class="tp-cp">${CP_EMOJI[c.type] ?? "📍"}</div>`,
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
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation isn't supported in this browser.")
      setSharing(false)
      return
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        if (mapRef.current && !centeredRef.current) {
          mapRef.current.setView([latitude, longitude], 14)
          centeredRef.current = true
        }
        const now = Date.now()
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
  }, [sharing, tripId])

  function toggleShare(v: boolean) {
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
        .tp-pin{width:40px;height:40px;border-radius:9999px;overflow:hidden;border:3px solid #10b981;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.35);display:grid;place-items:center;font-weight:600;font-size:12px;color:#111}
        .tp-pin img{width:100%;height:100%;object-fit:cover}
        .tp-pin-me{border-color:#2563eb}
        .tp-cp{font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));cursor:pointer}
        .leaflet-container{font:inherit}
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
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
                    <span>{CP_EMOJI[c.type] ?? "📍"}</span>
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
                      {CP_EMOJI[t.value]} {t.label}
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
