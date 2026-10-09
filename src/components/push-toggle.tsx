"use client"

import * as React from "react"
import { BellOff, BellRing, Loader2, Send, Smartphone } from "lucide-react"
import { toast } from "sonner"

import { isIOS, isStandalone, urlBase64ToUint8Array } from "@/lib/push-client"
import {
  getPushStatus,
  removePushSubscription,
  savePushSubscription,
  sendTestNotification,
} from "@/server/push"
import { Button } from "@/components/ui/button"

type State =
  | "checking"
  | "unsupported" // this browser can't do web push
  | "ios-install" // iPhone/iPad: install to the Home Screen first
  | "unavailable" // the server has no VAPID keys
  | "denied" // the person blocked notifications in the browser
  | "off"
  | "on"

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""

/** Opt this device in or out of push notifications. */
export function PushToggle() {
  const [state, setState] = React.useState<State>("checking")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    const set = (next: State) => alive && setState(next)

    async function detect() {
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
      if (!supported) return set(isIOS() && !isStandalone() ? "ios-install" : "unsupported")

      const status = await getPushStatus()
      if (!status.available || !PUBLIC_KEY) return set("unavailable")
      if (Notification.permission === "denied") return set("denied")

      // `ready` never settles if the service worker failed to register.
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ])
      if (!registration) return set("unsupported")
      const existing = await registration.pushManager.getSubscription()
      set(existing ? "on" : "off")
    }

    detect().catch(() => set("unsupported"))
    return () => {
      alive = false
    }
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off")
        toast.message("Notifications are off", {
          description: "You can allow them later in your browser's site settings.",
        })
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
        }))
      const json = subscription.toJSON()
      const res = await savePushSubscription(
        {
          endpoint: json.endpoint!,
          keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
        },
        navigator.userAgent
      )
      if (!res.ok) {
        await subscription.unsubscribe()
        toast.error(res.error)
        return
      }
      setState("on")
      toast.success("Notifications are on for this device")
    } catch (error) {
      console.error(error)
      toast.error("Couldn't turn notifications on. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await removePushSubscription(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setState("off")
      toast.success("Notifications are off for this device")
    } catch {
      toast.error("Couldn't turn notifications off.")
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true)
    const res = await sendTestNotification()
    setBusy(false)
    if (!res.ok) toast.error(res.error)
    else toast.success("Test sent. It should appear in a moment")
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center bg-primary/20 text-brand">
          {state === "on" ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
        </span>
        <div>
          <p className="text-sm font-medium">Push notifications</p>
          <p className="mt-0.5 max-w-md text-sm text-muted-foreground">
            {state === "checking" && "Checking this device…"}
            {state === "on" &&
              "On for this device. You'll hear about votes, polls, gear picks and expenses even when Trippo is closed."}
            {state === "off" &&
              "Get a nudge when your crew votes, opens a poll, suggests gear or adds an expense."}
            {state === "denied" &&
              "Blocked in your browser. Allow notifications for this site in the browser's settings, then come back."}
            {state === "unsupported" && "This browser doesn't support push notifications."}
            {state === "unavailable" && "Push isn't set up on this server yet. In-app notifications still work."}
            {state === "ios-install" && (
              <span className="inline-flex items-start gap-1.5">
                <Smartphone className="mt-0.5 size-4 shrink-0" />
                On iPhone, tap Share → “Add to Home Screen”, then open Trippo from there to turn this on.
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        {state === "off" && (
          <Button onClick={enable} disabled={busy} className="gap-2">
            {busy && <Loader2 className="size-4 animate-spin" />}
            Turn on
          </Button>
        )}
        {state === "on" && (
          <>
            <Button variant="outline" onClick={sendTest} disabled={busy} className="gap-2">
              <Send className="size-4" />
              Send test
            </Button>
            <Button variant="ghost" onClick={disable} disabled={busy}>
              Turn off
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
