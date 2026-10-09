"use client"

import * as React from "react"
import { Download, Wifi, WifiOff } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

// Online status as an external store, so there's no setState-in-effect.
function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}
const useOnline = () =>
  React.useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  )

/** Connectivity and "install the app" controls. (Push alerts live in Settings.) */
export function TripModeControls() {
  const online = useOnline()
  const [installPrompt, setInstallPrompt] = React.useState<InstallPrompt | null>(null)

  React.useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPrompt)
    }
    window.addEventListener("beforeinstallprompt", onInstall)
    return () => window.removeEventListener("beforeinstallprompt", onInstall)
  }, [])

  async function install() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === "accepted") toast.success("Trippo was added to your home screen.")
    setInstallPrompt(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={online ? "secondary" : "destructive"} className="gap-1.5 py-1">
        {online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
        {online ? "Online" : "Offline — showing saved pages"}
      </Badge>

      {installPrompt && (
        <Button variant="outline" size="sm" onClick={install} className="gap-1.5">
          <Download className="size-3.5" />
          Install app
        </Button>
      )}
    </div>
  )
}
