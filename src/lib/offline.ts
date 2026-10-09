/**
 * Trippo caches visited trip pages for offline use (see public/sw.js).
 * Those pages are personal, so they must be removed when someone signs out,
 * otherwise the next person on a shared device could open them offline.
 */
export async function clearOfflineData() {
  if (typeof window === "undefined" || !("caches" in window)) return
  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  } catch {
    // Best effort — never block sign-out on cache cleanup.
  }
}
