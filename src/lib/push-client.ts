/** The VAPID public key arrives base64url-encoded; the Push API wants raw bytes. */
export function urlBase64ToUint8Array(base64: string) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** True on iPhone/iPad, where web push only works once the app is on the Home Screen. */
export function isIOS() {
  if (typeof navigator === "undefined") return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** True when running as an installed app rather than a browser tab. */
export function isStandalone() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
