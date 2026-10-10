"use client"

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import * as React from "react"
import { toast } from "sonner"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Sparkles,
  Loader2,
  RotateCcw,
  X,
  Star,
  Clapperboard,
  MapPin,
  ExternalLink,
  Link2,
  Copy,
  Globe,
  Lock,
} from "lucide-react"

import { generateTripStory, requestTripStory, setStorySharing, type StoryData } from "@/server/story"
import { Button } from "@/components/ui/button"
import { ActivityIcon, activityIconSvg } from "@/components/activity-icon"
import { cssVarToHex } from "@/lib/css-color"

type LoadedStory = StoryData

const OSM_STYLE = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
}

function estimateMs(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(13000, Math.max(4000, words * 360 + 1800))
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)
  })
}

// Draw a Lucide icon inside a primary-coloured circle, with the stop number(s) as a square
// badge on its corner. Baked into the image so it stays crisp and never collides with map text.
async function makeIconMarker(iconKey: string, label: string): Promise<ImageData | null> {
  if (typeof document === "undefined") return null
  const fill = cssVarToHex("--primary")
  const ink = cssVarToHex("--primary-foreground", "#1f2e05")
  const svg = activityIconSvg(iconKey, {
    color: ink,
    size: 22,
    strokeWidth: 2.25,
  })
  const dpr = 2
  const W = 96
  const H = 80
  const cx = W / 2
  const cy = H / 2
  const c = document.createElement("canvas")
  c.width = W * dpr
  c.height = H * dpr
  const ctx = c.getContext("2d")
  if (!ctx) return null
  ctx.scale(dpr, dpr)
  ctx.beginPath()
  ctx.arc(cx, cy, 19, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = "#ffffff"
  ctx.stroke()
  if (svg) {
    try {
      const img = await loadSvgImage(svg)
      const s = 22
      ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s)
    } catch {
      /* fall back to the plain circle */
    }
  }
  if (label) {
    ctx.font = "700 13px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    const w = Math.max(20, ctx.measureText(label).width + 10)
    const bx = cx + 8
    const by = cy - 31
    ctx.fillStyle = "#10170a"
    ctx.fillRect(bx, by, w, 20)
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 1.5
    ctx.strokeRect(bx, by, w, 20)
    ctx.fillStyle = "#ffffff"
    ctx.fillText(label, bx + w / 2, by + 10.5)
  }
  return ctx.getImageData(0, 0, W * dpr, H * dpr)
}

/** Stops that share a spot (the airport at both ends of a trip) become one marker with all their numbers. */
function groupStops(scenes: LoadedStory["scenes"]) {
  const groups = new Map<string, { lat: number; lng: number; iconKey: string; ns: number[] }>()
  for (const sc of scenes) {
    const key = `${sc.lat.toFixed(3)},${sc.lng.toFixed(3)}`
    const g = groups.get(key)
    if (g) g.ns.push(sc.n)
    else groups.set(key, { lat: sc.lat, lng: sc.lng, iconKey: sc.iconKey, ns: [sc.n] })
  }
  return [...groups.values()].map((g) => ({ ...g, label: g.ns.join(", ") }))
}

/** Admin control for the public link: only this story is shared, never the trip. */
function StoryShare({ tripId, token, onChange }: { tripId: string; token: string | null; onChange: (token: string | null) => void }) {
  const [busy, setBusy] = React.useState(false)
  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  )
  const link = token ? `${origin}/story/${token}` : ""

  async function toggle(enabled: boolean) {
    setBusy(true)
    const res = await setStorySharing(tripId, enabled)
    setBusy(false)
    if (!res.ok) return void toast.error(res.error)
    onChange(res.shareToken)
    toast.success(enabled ? "Public link is on." : "Sharing stopped. The old link no longer works.")
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link copied")
    } catch {
      toast.error("Could not copy. Select the link and copy it.")
    }
  }

  if (!token) {
    return (
      <div className="mt-6 w-full max-w-md border-t pt-5 text-left">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Lock className="size-4 text-muted-foreground" />
          Only your crew can watch this
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Make a public link to share just this story. Nothing else about the trip is shared.
        </p>
        <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => toggle(true)} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
          Create public link
        </Button>
      </div>
    )
  }
  return (
    <div className="mt-6 w-full max-w-md border-t pt-5 text-left">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Globe className="size-4 text-brand" />
        Anyone with the link can watch this story
      </p>
      <div className="mt-3 flex gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Public story link"
          className="h-9 min-w-0 flex-1 border bg-background/60 px-3 text-xs outline-none focus-visible:border-primary"
        />
        <Button size="sm" className="h-9 gap-1.5" onClick={copy}>
          <Copy className="size-4" />
          Copy
        </Button>
      </div>
      <Button variant="ghost" size="sm" className="mt-2 h-8 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => toggle(false)} disabled={busy}>
        <Lock className="size-3.5" />
        Stop sharing
      </Button>
    </div>
  )
}

export function TripStory({
  tripId,
  initial,
  isAdmin,
  shareToken: initialToken,
  planConfirmed = true,
  publicMode = false,
}: {
  tripId: string
  /** The saved story, if one has been created. */
  initial: LoadedStory | null
  isAdmin: boolean
  shareToken: string | null
  /** The crew has approved the plan: only then can the story be created or requested. */
  planConfirmed?: boolean
  /** Someone watching through the public link: full screen, no controls that need an account. */
  publicMode?: boolean
}) {
  const [saved, setSaved] = React.useState<LoadedStory | null>(initial)
  const [token, setToken] = React.useState<string | null>(initialToken)
  const [story, setStory] = React.useState<LoadedStory | null>(publicMode ? initial : null)
  const [loading, setLoading] = React.useState(false)
  const [requested, setRequested] = React.useState(false)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<any>(null)
  const mlRef = React.useRef<any>(null)
  const mutedRef = React.useRef(false)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  // Public viewers get the device voice: the premium voice is paid for by the crew's account.
  const premiumUnavailableRef = React.useRef(publicMode)

  const [mapReady, setMapReady] = React.useState(false)
  const [started, setStarted] = React.useState(false)
  const [playing, setPlaying] = React.useState(false)
  const [muted, setMuted] = React.useState(false)
  const [step, setStep] = React.useState(0) // 0 = intro, 1..N = scene, N+1 = outro
  // Photo carousel position, remembered together with the step it belongs to
  // so it resets to the first photo on every new stop (no setState-in-effect).
  const [carousel, setCarousel] = React.useState({ step: 0, i: 0 })

  const N = story?.scenes.length ?? 0
  const imgIndex = carousel.step === step ? carousel.i : 0

  // Auto-cycle the current stop's photos.
  React.useEffect(() => {
    const imgs =
      story && step >= 1 && step <= N ? story.scenes[step - 1].images : []
    if (imgs.length <= 1) return
    const t = setInterval(
      () =>
        setCarousel((c) => ({
          step,
          i: ((c.step === step ? c.i : 0) + 1) % imgs.length,
        })),
      1800
    )
    return () => clearInterval(t)
  }, [step, story, N])

  async function create() {
    setLoading(true)
    const res = await generateTripStory(tripId)
    setLoading(false)
    if (res.ok) {
      setSaved(res.story)
      setStory(res.story)
    } else {
      toast.error(res.error)
    }
  }

  // Init MapLibre once the story is loaded and the container is mounted.
  React.useEffect(() => {
    if (!story) return
    let cancelled = false
    let ro: ResizeObserver | undefined

    async function init() {
      if (!document.getElementById("maplibre-css")) {
        const link = document.createElement("link")
        link.id = "maplibre-css"
        link.rel = "stylesheet"
        link.href =
          "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css"
        document.head.appendChild(link)
      }
      const ml = (await import("maplibre-gl")).default
      if (cancelled || !containerRef.current || mapRef.current || !story) return
      mlRef.current = ml
      const first = story.scenes[0]
      const map = new ml.Map({
        container: containerRef.current,
        style: OSM_STYLE as any,
        center: [first.lng, first.lat],
        zoom: 9,
        pitch: 0,
        attributionControl: false,
        maxPitch: 70,
      })
      map.on("load", async () => {
        if (cancelled || !story) return

        // Route: real road legs as solid lines, hops that cannot be driven (flights, ferries,
        // long jumps) as dashed straight lines, so every stop is joined to the next.
        const legs: { coords: number[][]; mode: string }[] =
          story.legs && story.legs.length > 0
            ? story.legs
            : [{ coords: story.route ?? story.scenes.map((s) => [s.lng, s.lat]), mode: "road" }]
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: legs.map((l) => ({
              type: "Feature",
              geometry: { type: "LineString", coordinates: l.coords },
              properties: { mode: l.mode },
            })),
          },
        })
        map.addLayer({
          id: "route-direct",
          type: "line",
          source: "route",
          filter: ["==", ["get", "mode"], "direct"],
          layout: { "line-cap": "butt", "line-join": "round" },
          paint: { "line-color": cssVarToHex("--chart-3"), "line-width": 3, "line-opacity": 0.75, "line-dasharray": [2, 2] },
        })
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          filter: ["==", ["get", "mode"], "road"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": cssVarToHex("--chart-3"), "line-width": 4, "line-opacity": 0.9 },
        })

        // Marker images: one per icon and number label.
        const places = groupStops(story.scenes)
        const imageId = (k: string, label: string) => `ic-${k}-${label}`
        await Promise.all(
          places.map(async (pl) => {
            const id = imageId(pl.iconKey, pl.label)
            if (map.hasImage(id)) return
            const img = await makeIconMarker(pl.iconKey, pl.label)
            if (img && !map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 })
          })
        )
        if (cancelled) return

        // Native stop pins (GPU-rendered, so no lag while the camera moves).
        map.addSource("stops", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: places.map((pl) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [pl.lng, pl.lat] },
              properties: { ns: `,${pl.ns.join(",")},`, icon: imageId(pl.iconKey, pl.label) },
            })),
          },
        })
        map.addLayer({
          id: "stops-halo",
          type: "circle",
          source: "stops",
          paint: { "circle-radius": 24, "circle-color": cssVarToHex("--primary"), "circle-opacity": 0.35 },
          filter: ["==", ["get", "ns"], ""],
        })
        map.addLayer({
          id: "stops-icon",
          type: "symbol",
          source: "stops",
          layout: {
            "icon-image": ["get", "icon"],
            "icon-size": 0.8,
            "icon-allow-overlap": true,
          },
        })
        map.resize()
        setMapReady(true)
      })
      mapRef.current = map

      // Keep the canvas sized to its flex container (fixes a blank map).
      if (containerRef.current) {
        ro = new ResizeObserver(() => mapRef.current?.resize())
        ro.observe(containerRef.current)
      }
    }
    init()
    return () => {
      cancelled = true
      ro?.disconnect()
      window.speechSynthesis?.cancel()
      mapRef.current?.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [story])

  // Camera movement: runs when the step changes.
  React.useEffect(() => {
    const map = mapRef.current
    const ml = mlRef.current
    if (!map || !ml || !mapReady || !story || !started) return

    if (step === 0 || step > N) {
      const coords = story.scenes.map((s) => [s.lng, s.lat]) as [number, number][]
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new ml.LngLatBounds(coords[0], coords[0])
      )
      map.fitBounds(bounds, {
        padding: 90,
        pitch: step > N ? 35 : 0,
        bearing: 0,
        duration: 2200,
        maxZoom: 12,
      })
    } else {
      const s = story.scenes[step - 1]
      map.flyTo({
        center: [s.lng, s.lat],
        zoom: 15.3,
        pitch: 55,
        bearing: (step * 22) % 360,
        speed: 0.8,
        curve: 1.5,
        essential: true,
      })
    }
    // highlight the current stop (native filter update, instant, no lag)
    if (map.getLayer("stops-halo")) {
      map.setFilter("stops-halo", step >= 1 && step <= N ? ["in", `,${step},`, ["get", "ns"]] : ["==", ["get", "ns"], ""])
    }
  }, [step, mapReady, started, story, N])

  // Narration: runs while playing.
  React.useEffect(() => {
    if (!started || !playing || !story || !mapReady) return
    const text =
      step === 0
        ? story.intro
        : step <= N
          ? story.scenes[step - 1].narration
          : story.outro

    let done = false
    const finish = () => {
      if (done) return
      done = true
      if (step >= N + 1) {
        setPlaying(false)
      } else {
        setStep((s) => s + 1)
      }
    }

    const speakWithDevice = () => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : null
      if (!synth || mutedRef.current) return
      try { synth.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.0; u.onend = finish; u.onerror = finish; synth.speak(u) } catch { /* timer remains */ }
    }
    if (!mutedRef.current) {
      if (premiumUnavailableRef.current) speakWithDevice()
      else fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, tripId }) })
        .then(async (response) => {
          if (!response.ok) { premiumUnavailableRef.current = true; speakWithDevice(); return }
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audioRef.current = audio
          audio.onended = () => { URL.revokeObjectURL(url); finish() }
          audio.onerror = () => { URL.revokeObjectURL(url); speakWithDevice() }
          audio.play().catch(speakWithDevice)
        }).catch(speakWithDevice)
    }
    const safety = setTimeout(finish, estimateMs(text) + (step === 0 ? 600 : 0))
    return () => {
      clearTimeout(safety)
      window.speechSynthesis?.cancel()
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [step, playing, started, story, mapReady, N, tripId])

  function start() {
    setStarted(true)
    setStep(0)
    setPlaying(true)
  }
  function restart() {
    window.speechSynthesis?.cancel()
    setStep(0)
    setPlaying(true)
  }
  function toggleMute() {
    setMuted((m) => {
      const next = !m
      mutedRef.current = next
      if (next) window.speechSynthesis?.cancel()
      return next
    })
  }

  async function askAdmins() {
    setLoading(true)
    const res = await requestTripStory(tripId)
    setLoading(false)
    if (res.ok) {
      setRequested(true)
      toast.success("Asked the admins to create the story.")
    } else {
      toast.error(res.error)
    }
  }

  // ── Launcher: the saved story waits for a click; admins can create it once ──
  if (!story) {
    return (
      <div className="flex flex-col items-center justify-center border border-dashed bg-card/50 px-6 py-14 text-center">
        <div className="mb-4 grid size-14 place-items-center bg-primary/10 text-brand">
          <Clapperboard className="size-7" />
        </div>
        {saved ? (
          <>
            <h3 className="text-lg font-semibold">{saved.tripName}, as a story</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {saved.scenes.length} stops, mapped stop to stop with photos and a voice-over.
            </p>
            <Button onClick={() => setStory(saved)} size="lg" className="mt-6 gap-2">
              <Play className="size-4" fill="currentColor" />
              Watch the story
            </Button>
            {isAdmin && <StoryShare tripId={tripId} token={token} onChange={setToken} />}
          </>
        ) : isAdmin ? (
          <>
            <h3 className="text-lg font-semibold">Your trip, as a story</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              A cinematic fly-through of your itinerary. The map travels stop to stop in 3D, with photos of each place
              and an AI voice-over. It is created once and then kept, so make sure the plan is final.
            </p>
            {!planConfirmed && (
              <p className="mt-3 max-w-md text-sm font-medium text-foreground">
                Available once everyone has approved the plan. Approve it in the Itinerary tab first.
              </p>
            )}
            <Button onClick={create} disabled={loading || !planConfirmed} size="lg" className="mt-6 gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading ? "Building your story…" : "Create visual story"}
            </Button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold">No story yet</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Only an admin can create the trip story, and only once. Ask them to make it when the plan is final, and it will show up here.
            </p>
            {!planConfirmed && (
              <p className="mt-3 max-w-md text-sm font-medium text-foreground">Available once everyone has approved the plan.</p>
            )}
            <Button onClick={askAdmins} disabled={loading || requested || !planConfirmed} variant={requested ? "outline" : "default"} size="lg" className="mt-6 gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" /> : requested ? <Clapperboard className="size-4" /> : <Sparkles className="size-4" />}
              {requested ? "Requested" : "Request an admin to create the story"}
            </Button>
          </>
        )}
      </div>
    )
  }

  const currentScene =
    step >= 1 && step <= N ? story.scenes[step - 1] : null
  const caption =
    step === 0 ? story.intro : step <= N ? story.scenes[step - 1].narration : story.outro
  const pct = Math.round((step / (N + 1)) * 100)

  const mapsUrl = currentScene
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${currentScene.placeName ?? currentScene.title} ${story.destination}`
      )}`
    : ""

  return (
    <div className="overflow-hidden border bg-card">
      <style>{`
        .maplibregl-ctrl-attrib{display:none}
        .story-shell{--story-h:min(68dvh,780px)}
        .story-photo{height:13rem}
        .story-map{height:42dvh;min-height:15rem}
        .story-left{border-bottom-width:0;border-top-width:1px}
        @media (min-width:768px), (orientation:landscape) and (min-width:560px){
          .story-shell{flex-direction:row}
          .story-left{width:clamp(270px,34vw,400px);flex-shrink:0;height:var(--story-h);min-height:20rem;border-top-width:0;border-right-width:1px}
          .story-mapwrap{flex:1;min-width:0}
          .story-map{height:var(--story-h);min-height:20rem}
        }
        @media (max-height:520px){
          .story-shell{--story-h:calc(100dvh - 4rem)}
          .story-photo{height:6.5rem}
        }
      `}</style>

      <div className="story-shell flex flex-col-reverse" style={publicMode ? ({ "--story-h": "calc(100dvh - 3.5rem)" } as React.CSSProperties) : undefined}>
        {/* LEFT: photos, details, links, controls */}
        <div className="story-left flex w-full flex-col border-b">
          {/* Photo carousel */}
          <div className="story-photo relative shrink-0 overflow-hidden bg-muted">
            {currentScene && currentScene.images.length > 0 ? (
              <>
                {currentScene.images.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${
                      i === imgIndex ? "opacity-100" : "opacity-0"
                    }`}
                  />
                ))}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <span className="absolute top-3 left-3 grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow">
                  {currentScene.n}
                </span>
                {currentScene.images.length > 1 && (
                  <div className="absolute top-3 right-3 flex gap-1">
                    {currentScene.images.map((_, i) => (
                      <span
                        key={i}
                        className={`h-1 w-4 rounded-full transition-colors ${
                          i === imgIndex ? "bg-white" : "bg-white/40"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="grid size-full place-items-center bg-gradient-to-br from-primary to-primary/60 px-4 text-center text-primary-foreground">
                {currentScene ? (
                  <div>
                    <span className="text-3xl font-bold">{currentScene.n}</span>
                    <p className="mt-1 text-sm font-medium">
                      {currentScene.title}
                    </p>
                  </div>
                ) : (
                  <div>
                    <Clapperboard className="mx-auto size-8" />
                    <p className="mt-2 text-sm font-medium">
                      {step === 0 ? "Your trip story" : "The finale"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Details (scrollable) */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {currentScene ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-brand">
                    Stop {currentScene.n} of {N}
                  </span>
                  <span>·</span>
                  <span>
                    Day {currentScene.dayNumber}
                    {currentScene.time ? ` · ${currentScene.time}` : ""}
                  </span>
                </div>
                <h3 className="mt-1.5 flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-brand">
                    <ActivityIcon
                      iconKey={currentScene.iconKey}
                      className="size-4"
                    />
                  </span>
                  <span>{currentScene.title}</span>
                  {currentScene.rating != null && (
                    <span className="flex shrink-0 items-center gap-0.5 text-sm text-muted-foreground">
                      <Star className="size-3.5 fill-amber-400 text-amber-400" />
                      {currentScene.rating}
                    </span>
                  )}
                </h3>
                {currentScene.placeName &&
                  currentScene.placeName !== currentScene.title && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      {currentScene.placeName}
                    </p>
                  )}
                <p className="mt-4 text-base leading-relaxed">
                  {currentScene.narration}
                </p>

                <div className="mt-5 border-t pt-4">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Resources
                  </p>
                  <div className="mt-2 flex flex-col gap-2 text-sm">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-brand hover:underline"
                    >
                      <MapPin className="size-3.5" />
                      Open in Google Maps
                      <ExternalLink className="size-3" />
                    </a>
                    {currentScene.sourceUrl && (
                      <a
                        href={currentScene.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-brand hover:underline"
                      >
                        <Link2 className="size-3.5" />
                        View source
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[8rem] flex-col justify-center">
                <p className="text-xl leading-relaxed font-medium">{caption}</p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex shrink-0 items-center gap-2 border-t p-3">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Previous"
            >
              <SkipBack className="size-4" />
            </button>
            <button
              onClick={() => (started ? setPlaying((p) => !p) : start())}
              className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="size-5" fill="currentColor" />
              ) : (
                <Play className="size-5 translate-x-0.5" fill="currentColor" />
              )}
            </button>
            <button
              onClick={() => setStep((s) => Math.min(N + 1, s + 1))}
              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Next"
            >
              <SkipForward className="size-4" />
            </button>
            <button
              onClick={restart}
              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Restart"
            >
              <RotateCcw className="size-4" />
            </button>
            <button
              onClick={toggleMute}
              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </button>
            <div className="ml-1 h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* RIGHT: map */}
        <div className="story-mapwrap relative w-full">
          <div
            ref={containerRef}
            className="story-map w-full"
          />

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <span className="pointer-events-auto rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
              {step === 0
                ? "Intro"
                : step <= N
                  ? `Stop ${step} of ${N}`
                  : "The end"}{" "}
              · {story.destination}
            </span>
            {!publicMode && (
              <button
                onClick={() => {
                  window.speechSynthesis?.cancel()
                  setStory(null)
                  setStarted(false)
                  setPlaying(false)
                }}
                className="pointer-events-auto grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md hover:bg-black/70"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {!started && (
            <button
              onClick={start}
              className="absolute inset-0 grid place-items-center bg-black/40 transition-colors hover:bg-black/30"
            >
              <span className="grid size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
                <Play className="size-9 translate-x-0.5" fill="currentColor" />
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
