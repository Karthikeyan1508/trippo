/* Trippo service worker: a small, privacy-aware offline shell + Web Push. */
const CACHE = "trippo-shell-v2"
const OFFLINE_URL = "/offline"
const APP_SHELL = [OFFLINE_URL, "/icons/192.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Never cache API responses or auth endpoints.
  if (url.pathname.startsWith("/api/")) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Keep the last-seen copy of trip pages for use without signal.
          if (response.ok && url.pathname.startsWith("/trips/")) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => (await caches.match(request)) || caches.match(OFFLINE_URL))
    )
    return
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(?:css|js|woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          })
      )
    )
  }
})

// ── Web Push ────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Trippo", {
      body: data.body || "You have a trip update.",
      icon: "/icons/192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag, // a newer notification with the same tag replaces the older one
      renotify: Boolean(data.tag),
      data: { url: data.url || "/dashboard" },
    })
  )
})

// Tapping a notification focuses an open Trippo tab (and takes it to the right
// page), or opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus()
          if ("navigate" in client) return client.navigate(target)
          return
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
