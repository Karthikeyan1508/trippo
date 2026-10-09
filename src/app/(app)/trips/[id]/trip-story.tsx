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
} from "lucide-react"

import { getTripStory, type TripStory as TripStoryType } from "@/server/story"
import { Button } from "@/components/ui/button"
import { ActivityIcon, activityIconSvg } from "@/components/activity-icon"
import { cssVarToHex } from "@/lib/css-color"

type LoadedStory = Extract<TripStoryType, { ok: true }>

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

// Draw a Lucide icon inside a primary-coloured circle for use as a map marker.
async function makeIconMarker(iconKey: string): Promise<ImageData | null> {
  if (typeof document === "undefined") return null
  const fill = cssVarToHex("--primary")
  const ink = cssVarToHex("--primary-foreground", "#1f2e05")
  const svg = activityIconSvg(iconKey, {
    color: ink,
    size: 22,
    strokeWidth: 2.25,
  })
  const dpr = 2
  const size = 44
  const c = document.createElement("canvas")
  c.width = size * dpr
  c.height = size * dpr
  const ctx = c.getContext("2d")
  if (!ctx) return null
  ctx.scale(dpr, dpr)
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = "#ffffff"
  ctx.stroke()
  if (svg) {
    try {
      const img = await loadSvgImage(svg)
      const s = 22
      ctx.drawImage(img, (size - s) / 2, (size - s) / 2, s, s)
    } catch {
      /* fall back to the plain circle */
    }
  }
  return ctx.getImageData(0, 0, size * dpr, size * dpr)
}

export function TripStory({ tripId }: { tripId: string }) {
  const [story, setStory] = React.useState<LoadedStory | null>(null)
  const [loading, setLoading] = React.useState(false)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<any>(null)
  const mlRef = React.useRef<any>(null)
  const mutedRef = React.useRef(false)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const premiumUnavailableRef = React.useRef(false)

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

  async function load() {
    setLoading(true)
    const res = await getTripStory(tripId)
    setLoading(false)
    if (res.ok) {
      setStory(res)
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

        // Route line through the stops (road-following when available).
        const routeCoords =
          story.route ?? story.scenes.map((s) => [s.lng, s.lat])
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates: routeCoords },
            properties: {},
          },
        })
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": cssVarToHex("--chart-3"), "line-width": 4, "line-opacity": 0.9 },
        })

        // Icon marker images (Lucide → canvas → usable on the GL map).
        const iconId = (k: string) => `ic-${k}`
        await Promise.all(
          [...new Set(story.scenes.map((s) => s.iconKey))].map(async (k) => {
            const id = iconId(k)
            if (map.hasImage(id)) return
            const img = await makeIconMarker(k)
            if (img && !map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 })
          })
        )
        if (cancelled) return

        // Native stop pins (GPU-rendered → no lag while the camera moves).
        map.addSource("stops", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: story.scenes.map((s) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [s.lng, s.lat] },
              properties: { n: s.n, icon: iconId(s.iconKey) },
            })),
          },
        })
        map.addLayer({
          id: "stops-halo",
          type: "circle",
          source: "stops",
          paint: { "circle-radius": 22, "circle-color": cssVarToHex("--primary"), "circle-opacity": 0.35 },
          filter: ["==", ["get", "n"], -1],
        })
        map.addLayer({
          id: "stops-icon",
          type: "symbol",
          source: "stops",
          layout: {
            "icon-image": ["get", "icon"],
            "icon-size": 0.62,
            "icon-allow-overlap": true,
            "text-field": ["to-string", ["get", "n"]],
            "text-font": ["Open Sans Bold"],
            "text-size": 11,
            "text-offset": [0, 1.35],
            "text-anchor": "top",
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#111827",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.4,
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

  // Camera movement — runs when the step changes.
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
    // highlight the current stop (native filter update — instant, no lag)
    if (map.getLayer("stops-halo")) {
      map.setFilter("stops-halo", [
        "==",
        ["get", "n"],
        step >= 1 && step <= N ? step : -1,
      ])
    }
  }, [step, mapReady, started, story, N])

  // Narration — runs while playing.
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

  // ── Launcher (before the story is built) ──────────────────────────────
  if (!story) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-brand">
          <Clapperboard className="size-7" />
        </div>
        <h3 className="text-lg font-semibold">Your trip, as a story</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          A cinematic fly-through of your itinerary — the map travels stop to
          stop in 3D, with photos of each place and an AI voice-over.
        </p>
        <Button onClick={load} disabled={loading} size="lg" className="mt-6 gap-2">
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {loading ? "Building your story…" : "Create visual story"}
        </Button>
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
    <div className="overflow-hidden rounded-2xl border bg-card">
      <style>{`.maplibregl-ctrl-attrib{display:none}`}</style>

      <div className="flex flex-col lg:flex-row">
        {/* LEFT — photos, details, links, controls */}
        <div className="flex w-full flex-col border-b lg:h-[68vh] lg:min-h-[540px] lg:w-[400px] lg:shrink-0 lg:border-r lg:border-b-0">
          {/* Photo carousel */}
          <div className="relative h-52 shrink-0 overflow-hidden bg-muted">
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
          <div className="flex-1 overflow-y-auto p-5 lg:min-h-0">
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

        {/* RIGHT — map */}
        <div className="relative w-full lg:flex-1">
          <div
            ref={containerRef}
            className="h-72 w-full lg:h-[68vh] lg:min-h-[540px]"
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
