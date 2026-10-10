import { haversineKm } from "@/lib/geo"

/**
 * The numbered stops on the itinerary map: every stop with coordinates, in order across
 * the days. One home leg (the flight from a distant airport) is left off so the map stays
 * zoomed on where the group actually goes. The same numbers are used in the plan list and
 * in chat, so "stop 3" means the same thing everywhere.
 */

export type StopLike = { id: string; lat: number | null; lng: number | null; category: string }

export function numberStops(days: { items: StopLike[] }[]): Map<string, number> {
  const located = days.flatMap((d) => d.items).filter((it) => it.lat != null && it.lng != null)
  const onSite = located.filter((it) => it.category !== "TRAVEL")

  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const focus =
    onSite.length > 0
      ? { lat: median(onSite.map((it) => it.lat as number)), lng: median(onSite.map((it) => it.lng as number)) }
      : null
  const nearTrip = (it: StopLike) =>
    !focus || it.category !== "TRAVEL" || haversineKm({ lat: it.lat as number, lng: it.lng as number }, focus) <= 250

  const numbers = new Map<string, number>()
  for (const day of days) {
    for (const it of day.items) {
      if (it.lat != null && it.lng != null && nearTrip(it)) numbers.set(it.id, numbers.size + 1)
    }
  }
  return numbers
}
