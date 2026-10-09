"use client"

import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  Coffee,
  Sandwich,
  UtensilsCrossed,
  Wine,
  Cookie,
  Utensils,
  Plane,
  TrainFront,
  Bus,
  Ship,
  Bike,
  Footprints,
  Car,
  BedDouble,
  Waves,
  Landmark,
  Mountain,
  Flower2,
  ShoppingBag,
  PartyPopper,
  Camera,
  MapPin,
  type LucideIcon,
} from "lucide-react"

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sandwich,
  dinner: UtensilsCrossed,
  drinks: Wine,
  snack: Cookie,
  food: Utensils,
  flight: Plane,
  train: TrainFront,
  bus: Bus,
  ferry: Ship,
  bike: Bike,
  walk: Footprints,
  drive: Car,
  travel: Car,
  stay: BedDouble,
  beach: Waves,
  heritage: Landmark,
  trek: Mountain,
  spa: Flower2,
  shopping: ShoppingBag,
  event: PartyPopper,
  activity: Camera,
  default: MapPin,
}

export function iconForKey(iconKey: string): LucideIcon {
  return ACTIVITY_ICONS[iconKey] ?? ACTIVITY_ICONS.default
}

export function ActivityIcon({
  iconKey,
  className,
}: {
  iconKey: string
  className?: string
}) {
  return React.createElement(iconForKey(iconKey), { className })
}

/** SVG markup for a key's icon — used to draw markers on Leaflet/MapLibre maps. */
export function activityIconSvg(
  iconKey: string,
  opts?: { color?: string; size?: number; strokeWidth?: number }
): string {
  const Icon = iconForKey(iconKey)
  try {
    return renderToStaticMarkup(
      React.createElement(Icon, {
        color: opts?.color ?? "currentColor",
        size: opts?.size ?? 24,
        strokeWidth: opts?.strokeWidth ?? 2,
      })
    )
  } catch {
    return ""
  }
}
