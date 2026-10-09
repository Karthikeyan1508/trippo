"use client"

import * as React from "react"
import { Loader2, LocateFixed, MapPinOff } from "lucide-react"
import { toast } from "sonner"

import { reportLocationOff, updateMyLocation } from "@/server/location"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Keeps this device's location flowing to the crew for as long as a trip is
 * open on it.
 *
 * - The browser's own permission prompt appears as soon as the trip opens.
 * - While allowed, the position is sent every few seconds (and whenever it
 *   changes), so the crew's map is always current.
 * - If location is blocked or switched off on the device, the crew keeps the
 *   last known spot (greyed out), and this person is asked to allow it again.
 *
 * Web apps can't read location once the tab or app is closed, so "always on"
 * means "whenever Trippo is open". Everything else is the browser's call.
 */

export type LocationStatus =
  | "starting" // asking the browser / waiting for the first fix
  | "live"
  | "denied" // permission blocked for Trippo
  | "unavailable" // device location is off, or no fix can be found
  | "unsupported"

export type MyPosition = { lat: number; lng: number; accuracy: number; at: number }

type LocationContextValue = {
  status: LocationStatus
  position: MyPosition | null
  /** Ask the browser/device for the location again. */
  retry: () => void
  retrying: boolean
  /** Show the "please allow location" dialog. */
  openHelp: () => void
}

const LocationContext = React.createContext<LocationContextValue | null>(null)

export function useMyLocation() {
  const ctx = React.useContext(LocationContext)
  if (!ctx) throw new Error("useMyLocation must be used inside <LocationProvider>")
  return ctx
}

const SEND_EVERY_MS = 8_000
const HEARTBEAT_MS = 10_000
const RETRY_MS = 15_000
const SNOOZE_MS = 10 * 60 * 1000

const subscribeNothing = () => () => {}

/** Milliseconds left on "Not now" for this trip (0 when it isn't snoozed). */
function snoozeRemaining(key: string) {
  try {
    return Math.max(0, Number(sessionStorage.getItem(key)) - Date.now())
  } catch {
    return 0
  }
}

const blocked = (status: LocationStatus) =>
  status === "denied" || status === "unavailable" || status === "unsupported"

export function LocationProvider({
  tripId,
  children,
}: {
  tripId: string
  children: React.ReactNode
}) {
  const [status, setStatus] = React.useState<LocationStatus>("starting")
  const [position, setPosition] = React.useState<MyPosition | null>(null)
  const [retrying, setRetrying] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)
  const supported = React.useSyncExternalStore(
    subscribeNothing,
    () => "geolocation" in navigator,
    () => true
  )
  const beginRef = React.useRef<() => void>(() => {})

  const snoozeKey = `trippo:location-snooze:${tripId}`
  const [snoozed, setSnoozed] = React.useState(() => snoozeRemaining(snoozeKey) > 0)
  // When the snooze runs out, ask again.
  React.useEffect(() => {
    if (!snoozed) return
    const timer = window.setTimeout(() => setSnoozed(false), Math.max(snoozeRemaining(snoozeKey), 1))
    return () => window.clearTimeout(timer)
  }, [snoozed, snoozeKey])

  React.useEffect(() => {
    if (!supported) return

    let disposed = false
    let live = false
    let watchId: number | null = null
    let retryTimer: number | undefined
    let lastSent = 0
    let lastPosition: MyPosition | null = null
    let reportedOff: string | null = null

    const send = (p: MyPosition) => {
      lastSent = Date.now()
      updateMyLocation(tripId, p.lat, p.lng, p.accuracy).catch(() => {
        /* offline: the next heartbeat tries again */
      })
    }

    const markOff = (reason: "denied" | "unavailable") => {
      live = false
      if (reportedOff === reason) return
      reportedOff = reason
      reportLocationOff(tripId, reason).catch(() => {})
    }

    const stopWatch = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      watchId = null
    }

    const onFix = (pos: GeolocationPosition) => {
      window.clearTimeout(retryTimer)
      const p: MyPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: Date.now(),
      }
      lastPosition = p
      live = true
      reportedOff = null
      setPosition(p)
      setStatus("live")
      setRetrying(false)
      if (Date.now() - lastSent >= SEND_EVERY_MS) send(p)
    }

    const onError = (error: GeolocationPositionError) => {
      setRetrying(false)
      if (error.code === error.PERMISSION_DENIED) {
        setStatus("denied")
        markOff("denied")
        stopWatch()
        return
      }
      if (error.code === error.POSITION_UNAVAILABLE || !lastPosition) {
        setStatus("unavailable")
        markOff("unavailable")
        // Re-create the watch now and then; it recovers once location is back on.
        window.clearTimeout(retryTimer)
        retryTimer = window.setTimeout(() => !disposed && !live && begin(), RETRY_MS)
      }
      // A timeout after we already had a fix: keep going with the last position.
    }

    const begin = () => {
      stopWatch()
      watchId = navigator.geolocation.watchPosition(onFix, onError, {
        enableHighAccuracy: true,
        maximumAge: 15_000,
        timeout: 30_000,
      })
    }
    beginRef.current = () => {
      setRetrying(true)
      begin()
      // A blocked permission answers instantly; give slow fixes a moment, then stop the spinner.
      window.setTimeout(() => !disposed && setRetrying(false), 4_000)
    }

    begin()

    // Heartbeat: a person standing still produces no new fixes, but should stay "live".
    const heartbeat = window.setInterval(() => {
      if (live && lastPosition) send(lastPosition)
    }, HEARTBEAT_MS)

    // The person may flip the permission in browser settings while we're open.
    let permission: PermissionStatus | undefined
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        if (disposed) return
        permission = result
        result.onchange = () => {
          if (result.state === "granted") begin()
          else if (result.state === "denied") {
            setStatus("denied")
            markOff("denied")
            stopWatch()
          }
        }
      })
      .catch(() => {})

    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      if (live && lastPosition) send(lastPosition)
      else begin()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", onVisible)

    return () => {
      disposed = true
      stopWatch()
      window.clearInterval(heartbeat)
      window.clearTimeout(retryTimer)
      if (permission) permission.onchange = null
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", onVisible)
    }
  }, [tripId, supported])

  // Tell people when it comes back on after a problem.
  const wasBlocked = React.useRef(false)
  React.useEffect(() => {
    if (blocked(status)) wasBlocked.current = true
    else if (status === "live" && wasBlocked.current) {
      wasBlocked.current = false
      setHelpOpen(false)
      toast.success("Location is back on. Your crew can see you again.")
    }
  }, [status])

  const effectiveStatus: LocationStatus = supported ? status : "unsupported"
  const value = React.useMemo<LocationContextValue>(
    () => ({
      status: effectiveStatus,
      position,
      retrying,
      retry: () => beginRef.current(),
      openHelp: () => setHelpOpen(true),
    }),
    [effectiveStatus, position, retrying]
  )

  const dialogOpen = helpOpen || (blocked(effectiveStatus) && !snoozed)

  function dismiss() {
    setHelpOpen(false)
    setSnoozed(true)
    try {
      sessionStorage.setItem(snoozeKey, String(Date.now() + SNOOZE_MS))
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <LocationContext.Provider value={value}>
      {children}
      <LocationDialog open={dialogOpen} onDismiss={dismiss} />
    </LocationContext.Provider>
  )
}

function platformSteps(status: LocationStatus) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent
  const ios = /iPhone|iPad|iPod/i.test(ua)
  const android = /Android/i.test(ua)
  const mac = /Macintosh/i.test(ua) && !ios
  const windows = /Windows/i.test(ua)

  if (status === "denied") {
    if (ios) return "Open Settings → Privacy & Security → Location Services, then set Safari Websites (or Trippo) to “While Using”."
    if (android) return "Tap the lock icon in the address bar → Permissions → Location → Allow."
    return "Click the lock (or settings) icon at the left of the address bar, set Location to Allow, then press Try again."
  }
  if (ios) return "Open Settings → Privacy & Security → Location Services and switch it on."
  if (android) return "Swipe down from the top of the screen and switch Location on."
  if (mac) return "Open System Settings → Privacy & Security → Location Services and switch it on."
  if (windows) return "Open Settings → Privacy & security → Location and switch Location services on."
  return "Switch location services on in your device settings."
}

function LocationDialog({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const { status, retry, retrying } = useMyLocation()

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 grid size-11 place-items-center bg-primary/20 text-brand">
            <MapPinOff className="size-5" />
          </div>
          <DialogTitle>Allow Trippo to use your location</DialogTitle>
          <DialogDescription className="text-left leading-relaxed">
            {status === "unsupported"
              ? "This browser can't share a location, so your crew won't see you on the map."
              : "Trippo is using your device location to keep your crew in sync, but it can't reach it right now. Please allow it to access your location."}
          </DialogDescription>
        </DialogHeader>

        {status !== "unsupported" && (
          <div className="space-y-2 border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {status === "denied" ? "Location is blocked for Trippo" : "Location is switched off on this device"}
            </p>
            <p className="text-muted-foreground">{platformSteps(status)}</p>
            <p className="text-xs text-muted-foreground">
              Until then, your crew sees the last place you were, greyed out.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onDismiss}>
            Not now
          </Button>
          {status !== "unsupported" && (
            <Button onClick={retry} disabled={retrying} className="gap-2">
              {retrying ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
              Try again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A thin strip shown while location is off, so it never goes unnoticed. */
export function LocationBanner() {
  const { status, openHelp } = useMyLocation()
  if (!blocked(status)) return null
  return (
    <div className="flex items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm lg:px-6">
      <MapPinOff className="size-4 shrink-0 text-destructive" />
      <p className="min-w-0 flex-1">
        Your location is off, so your crew only sees where you were last.
      </p>
      <Button size="sm" variant="outline" onClick={openHelp}>
        Fix it
      </Button>
    </div>
  )
}
