/**
 * Geography helpers for route planning. Pure functions, no I/O.
 *
 * Distances are great-circle ("as the crow flies") with a road factor on top,
 * which is good enough to tell a sensible route from a silly one. We never
 * claim turn-by-turn accuracy.
 */

export type LatLng = { lat: number; lng: number }

export function isValidLatLng({ lat, lng }: LatLng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

const EARTH_KM = 6371

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Roads wind: real distance is typically 25-35% longer than the straight line. */
export const ROAD_FACTOR = 1.3

export function roadKm(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * ROAD_FACTOR
}

/**
 * Door-to-door driving time. Short hops crawl through towns (about 25 km/h),
 * long ones get onto faster roads (up to about 60 km/h), so speed grows with distance.
 */
export function driveMinutes(km: number): number {
  const kmh = Math.min(60, 25 + 0.3 * km)
  return Math.round((km / kmh) * 60)
}

/** Total length of a path that visits the points in order. */
export function pathKm(points: LatLng[], dist: (a: LatLng, b: LatLng) => number = roadKm): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i])
  return total
}

/**
 * The visiting order of `stops` that minimises travel, starting at `start`
 * and, when given, finishing at `end`. Returns indices into `stops`.
 *
 * Exact (Held-Karp dynamic programming) up to 12 stops; beyond that a
 * nearest-neighbour tour improved with 2-opt, which is within a few percent.
 */
export function bestOrder(start: LatLng, stops: LatLng[], end?: LatLng): number[] {
  const n = stops.length
  if (n <= 1) return stops.map((_, i) => i)
  const d = (a: LatLng, b: LatLng) => haversineKm(a, b)

  if (n <= 12) {
    const dist = stops.map((a) => stops.map((b) => d(a, b)))
    const full = (1 << n) - 1
    const INF = Number.POSITIVE_INFINITY
    // dp[mask][j]: cheapest way to leave `start`, visit `mask`, and stand at j.
    const dp: number[][] = Array.from({ length: 1 << n }, () => new Array(n).fill(INF))
    const parent: number[][] = Array.from({ length: 1 << n }, () => new Array(n).fill(-1))
    for (let j = 0; j < n; j++) dp[1 << j][j] = d(start, stops[j])

    for (let mask = 1; mask <= full; mask++) {
      for (let j = 0; j < n; j++) {
        const cost = dp[mask][j]
        if (cost === INF || !(mask & (1 << j))) continue
        for (let k = 0; k < n; k++) {
          if (mask & (1 << k)) continue
          const next = mask | (1 << k)
          const total = cost + dist[j][k]
          if (total < dp[next][k]) {
            dp[next][k] = total
            parent[next][k] = j
          }
        }
      }
    }

    let bestEnd = 0
    let best = INF
    for (let j = 0; j < n; j++) {
      const total = dp[full][j] + (end ? d(stops[j], end) : 0)
      if (total < best) {
        best = total
        bestEnd = j
      }
    }
    const order: number[] = []
    let mask = full
    let cur = bestEnd
    while (cur !== -1) {
      order.push(cur)
      const prev = parent[mask][cur]
      mask &= ~(1 << cur)
      cur = prev
    }
    return order.reverse()
  }

  // Nearest neighbour, then 2-opt.
  const remaining = new Set(stops.map((_, i) => i))
  const order: number[] = []
  let here = start
  while (remaining.size > 0) {
    let pick = -1
    let min = Number.POSITIVE_INFINITY
    for (const i of remaining) {
      const dd = d(here, stops[i])
      if (dd < min) {
        min = dd
        pick = i
      }
    }
    order.push(pick)
    remaining.delete(pick)
    here = stops[pick]
  }
  const length = (o: number[]) =>
    pathKm([start, ...o.map((i) => stops[i]), ...(end ? [end] : [])], d)
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)]
        if (length(candidate) + 1e-9 < length(order)) {
          order.splice(0, order.length, ...candidate)
          improved = true
        }
      }
    }
  }
  return order
}

// ── Clock helpers ("HH:MM" strings) ─────────────────────────────────────

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Round up to the next quarter hour, which reads better than 11:07. */
export function roundUp15(total: number): number {
  return Math.ceil(total / 15) * 15
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}
