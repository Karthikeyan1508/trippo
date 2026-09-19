import { notFound } from "next/navigation"
import { format } from "date-fns"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { formatDateRange, tripDurationDays, prettifyEnum } from "@/lib/format"
import { PrintControls } from "./print-controls"

export default async function PrintPage({
  params,
}: PageProps<"/print/trips/[id]">) {
  const { id } = await params
  const user = await requireUser()

  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      members: { where: { userId: user.id }, select: { id: true } },
      itineraries: {
        orderBy: { generatedAt: "desc" },
        take: 1,
        include: {
          days: {
            orderBy: { dayNumber: "asc" },
            include: { items: { orderBy: { order: "asc" } } },
          },
        },
      },
      prep: true,
    },
  })

  if (!trip || trip.members.length === 0) notFound()

  const itinerary = trip.itineraries[0]
  const prep = trip.prep
  const days = tripDurationDays(trip.startDate, trip.endDate)

  const etiquette = (prep?.etiquette as string[] | undefined) ?? []
  const documents = (prep?.documents as string[] | undefined) ?? []
  const packing =
    (prep?.packing as { category: string; items: string[] }[] | undefined) ?? []

  return (
    <div className="mx-auto max-w-3xl bg-background px-6 py-8 print:py-0">
      <PrintControls />

      {/* Cover */}
      <header className="border-b pb-4">
        <p className="text-sm font-medium text-primary">Trippo</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{trip.name}</h1>
        <p className="mt-2 text-muted-foreground">
          {trip.destination}
          {trip.originCity ? ` · from ${trip.originCity}` : ""} ·{" "}
          {formatDateRange(trip.startDate, trip.endDate)} · {days} days ·{" "}
          {prettifyEnum(trip.tripType)}
        </p>
      </header>

      {/* Itinerary */}
      {itinerary && (
        <section className="mt-6">
          <h2 className="text-xl font-semibold">Itinerary</h2>
          {itinerary.summary && (
            <p className="mt-1 text-sm text-muted-foreground">
              {itinerary.summary}
            </p>
          )}
          <div className="mt-4 space-y-5">
            {itinerary.days.map((day) => (
              <div
                key={day.id}
                className="break-inside-avoid rounded-lg border p-4"
              >
                <h3 className="font-semibold">
                  Day {day.dayNumber}
                  {day.title ? ` — ${day.title}` : ""}
                  {day.date && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {format(day.date, "EEE, d MMM")}
                    </span>
                  )}
                </h3>
                <ul className="mt-2 space-y-2">
                  {day.items.map((item) => (
                    <li key={item.id} className="flex gap-3 text-sm">
                      <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                        {item.startTime ?? ""}
                      </span>
                      <span>
                        <span className="font-medium">{item.title}</span>
                        {item.placeName && item.placeName !== item.title && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {item.placeName}
                          </span>
                        )}
                        {item.why && (
                          <span className="block text-xs text-muted-foreground">
                            {item.why}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Prep */}
      {prep && (
        <section className="mt-8 break-inside-avoid">
          <h2 className="text-xl font-semibold">Before you go</h2>

          {etiquette.length > 0 && (
            <div className="mt-3">
              <h3 className="font-medium">Etiquette & tips</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {etiquette.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {documents.length > 0 && (
            <div className="mt-4">
              <h3 className="font-medium">Documents to carry</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {documents.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {packing.length > 0 && (
            <div className="mt-4">
              <h3 className="font-medium">Packing list</h3>
              <div className="mt-1 grid gap-4 sm:grid-cols-2">
                {packing.map((cat, i) => (
                  <div key={i}>
                    <p className="text-sm font-medium">{cat.category}</p>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                      {cat.items.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {!itinerary && !prep && (
        <p className="mt-8 text-muted-foreground">
          Nothing to print yet — generate the itinerary and prep guide first.
        </p>
      )}

      <footer className="mt-10 border-t pt-4 text-center text-xs text-muted-foreground">
        Generated with Trippo · {format(new Date(), "d MMM yyyy")}
      </footer>
    </div>
  )
}
