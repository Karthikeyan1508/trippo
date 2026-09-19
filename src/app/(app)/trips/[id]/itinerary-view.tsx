import { Sparkles, Star, ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { activityIconKey, activityLabel, categoryColor } from "@/lib/trip-icons"
import { ActivityIcon } from "@/components/activity-icon"

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
    <div className="space-y-5">
      {itinerary.summary && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">{itinerary.summary}</p>
          <Badge
            variant={itinerary.source === "AI" ? "default" : "secondary"}
            className="shrink-0"
          >
            {itinerary.source === "AI" ? "AI plan" : "Sample"}
          </Badge>
        </div>
      )}

      {itinerary.days.map((day) => (
        <div key={day.id} className="rounded-2xl border bg-card">
          {/* Day header — sticky while its stops scroll */}
          <div className="sticky top-16 z-20 flex items-center gap-3 rounded-t-2xl border-b bg-muted px-5 py-3 shadow-sm">
            <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
              Day {day.dayNumber}
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold">
                {day.title ?? `Day ${day.dayNumber}`}
              </h4>
              {day.date && (
                <p className="text-xs text-muted-foreground">
                  {format(day.date, "EEEE, d MMM")}
                </p>
              )}
            </div>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {day.items.length} {day.items.length === 1 ? "stop" : "stops"}
            </span>
          </div>

          {/* Timeline */}
          <ol className="px-5 py-4">
            {day.items.map((item, idx) => {
              const num = stopNumbers?.[item.id]
              const iconKey = activityIconKey(
                item.category,
                item.title,
                item.description
              )
              const isLast = idx === day.items.length - 1
              return (
                <li key={item.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {!isLast && (
                    <span
                      aria-hidden
                      className="absolute top-9 bottom-0 left-4 w-px -translate-x-1/2 bg-border"
                    />
                  )}

                  {/* Marker */}
                  <span
                    className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-card ${categoryColor(
                      item.category
                    )}`}
                  >
                    <ActivityIcon iconKey={iconKey} className="size-4" />
                    {num != null && (
                      <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-card">
                        {num}
                      </span>
                    )}
                  </span>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {item.startTime && (
                        <span className="font-medium tabular-nums text-foreground">
                          {item.startTime}
                        </span>
                      )}
                      <span>
                        {activityLabel(
                          item.category,
                          item.title,
                          item.description
                        )}
                      </span>
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium leading-snug">
                        {item.title}
                      </span>
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
                          className="text-muted-foreground hover:text-primary"
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
                      <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                        <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" />
                        <span>{item.why}</span>
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ))}

      <p className="text-center text-xs text-muted-foreground">
        Generated {format(itinerary.generatedAt, "d MMM, HH:mm")}
        {itinerary.model ? ` · ${itinerary.model}` : ""}
      </p>
    </div>
  )
}
