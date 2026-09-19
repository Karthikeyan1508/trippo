import {
  Plane,
  BedDouble,
  Utensils,
  MapPin,
  ShoppingBag,
  PartyPopper,
  Sparkles,
  Star,
  ExternalLink,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

const CATEGORY: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  TRAVEL: { icon: Plane, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  STAY: { icon: BedDouble, className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  FOOD: { icon: Utensils, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ACTIVITY: { icon: MapPin, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  SHOPPING: { icon: ShoppingBag, className: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
  EVENT: { icon: PartyPopper, className: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400" },
  OTHER: { icon: Sparkles, className: "bg-muted text-muted-foreground" },
}

type Item = {
  id: string
  startTime: string | null
  title: string
  description: string | null
  category: string
  placeName: string | null
  rating: number | null
  sourceUrl: string | null
  why: string | null
}

type Day = {
  id: string
  dayNumber: number
  date: Date | null
  title: string | null
  items: Item[]
}

export type ItineraryData = {
  source: string
  model: string | null
  summary: string | null
  generatedAt: Date
  days: Day[]
}

export function ItineraryView({
  itinerary,
  stopNumbers,
}: {
  itinerary: ItineraryData
  stopNumbers?: Record<string, number>
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{itinerary.summary}</p>
          <Badge variant={itinerary.source === "AI" ? "default" : "secondary"}>
            {itinerary.source === "AI" ? "AI plan" : "Sample"}
          </Badge>
        </div>
      </div>

      {itinerary.days.map((day) => (
        <div key={day.id} className="rounded-xl border bg-card">
          <div className="flex items-baseline gap-3 border-b px-5 py-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {day.dayNumber}
            </span>
            <div>
              <h4 className="font-medium">{day.title ?? `Day ${day.dayNumber}`}</h4>
              {day.date && (
                <p className="text-xs text-muted-foreground">
                  {format(day.date, "EEEE, d MMM")}
                </p>
              )}
            </div>
          </div>

          <ul className="divide-y">
            {day.items.map((item) => {
              const cat = CATEGORY[item.category] ?? CATEGORY.OTHER
              const Icon = cat.icon
              return (
                <li key={item.id} className="flex gap-3 px-5 py-3.5">
                  {stopNumbers?.[item.id] != null && (
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {stopNumbers[item.id]}
                    </span>
                  )}
                  <div className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                    {item.startTime ?? ""}
                  </div>
                  <div
                    className={`grid size-8 shrink-0 place-items-center rounded-lg ${cat.className}`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium">{item.title}</span>
                      {item.rating != null && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Star className="size-3 fill-amber-400 text-amber-400" />
                          {item.rating}
                        </span>
                      )}
                      {item.sourceUrl && (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Open source"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                    {item.placeName && item.placeName !== item.title && (
                      <p className="text-sm text-muted-foreground">
                        {item.placeName}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    {item.why && (
                      <p className="mt-1 text-xs text-muted-foreground/80 italic">
                        {item.why}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <p className="text-center text-xs text-muted-foreground">
        Generated {format(itinerary.generatedAt, "d MMM, HH:mm")}
        {itinerary.model ? ` · ${itinerary.model}` : ""}
      </p>
    </div>
  )
}
