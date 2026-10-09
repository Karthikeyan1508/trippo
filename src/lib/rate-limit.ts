/**
 * Tiny fixed-window limiter, keyed by an arbitrary string (e.g. a user id).
 *
 * In-memory, so each server instance counts separately — good enough to stop
 * a runaway client from burning paid API credits, not a security boundary.
 */
const hits = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const entry = hits.get(key)

  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs })
    // Opportunistic cleanup so the map can't grow without bound.
    if (hits.size > 5_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
    }
    return { ok: true as const, retryAfter: 0 }
  }

  entry.count += 1
  if (entry.count > limit) {
    return { ok: false as const, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { ok: true as const, retryAfter: 0 }
}
