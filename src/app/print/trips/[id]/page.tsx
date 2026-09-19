import { notFound } from "next/navigation"
import { format } from "date-fns"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import {
  formatDateRange,
  tripDurationDays,
  prettifyEnum,
  formatMoney,
} from "@/lib/format"
import { activityLabel } from "@/lib/trip-icons"
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
  const phrases =
    (prep?.phrases as { phrase: string; meaning: string }[] | undefined) ?? []

  return (
    <div className="mx-auto max-w-3xl bg-white px-8 py-10 text-neutral-900 print:px-0 print:py-0">
      <style>{`
        @page { margin: 1.5cm; }
        html, body { background: #fff; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <PrintControls />

      {/* Cover */}
      <header className="border-b-4 border-primary pb-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold tracking-[0.2em] text-primary uppercase">
            Trippo
          </span>
          <span className="text-xs text-neutral-500">
            {formatDateRange(trip.startDate, trip.endDate)} · {days} days
          </span>
        </div>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">{trip.name}</h1>
        <p className="mt-2 text-neutral-600">
          {trip.destination}
          {trip.originCity ? ` · from ${trip.originCity}` : ""} ·{" "}
          {prettifyEnum(trip.tripType)}
          {trip.budgetPerPerson != null
            ? ` · ${formatMoney(trip.budgetPerPerson, trip.currency)}/person`
            : ""}
        </p>
      </header>

      {/* Itinerary */}
      {itinerary && (
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">Itinerary</h2>
          {itinerary.summary && (
            <p className="mt-1 text-sm text-neutral-600">{itinerary.summary}</p>
          )}

          <div className="mt-5 space-y-6">
            {itinerary.days.map((day) => (
              <div key={day.id} className="break-inside-avoid">
                <div className="flex items-baseline gap-2.5">
                  <span className="rounded bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                    Day {day.dayNumber}
                  </span>
                  <h3 className="font-semibold">
                    {day.title ?? `Day ${day.dayNumber}`}
                  </h3>
                  {day.date && (
                    <span className="text-xs text-neutral-500">
                      {format(day.date, "EEE, d MMM")}
                    </span>
                  )}
                </div>

                <ul className="mt-2.5 ml-1 space-y-3 border-l border-neutral-200 pl-4">
                  {day.items.map((item) => (
                    <li key={item.id} className="relative">
                      <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary ring-2 ring-white" />
                      <div className="flex gap-3">
                        <span className="w-11 shrink-0 pt-px text-xs tabular-nums text-neutral-500">
                          {item.startTime ?? ""}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm leading-snug">
                            <span className="mr-1.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                              {activityLabel(
                                item.category,
                                item.title,
                                item.description
                              )}
                            </span>
                            <span className="font-semibold">{item.title}</span>
                            {item.placeName &&
                              item.placeName !== item.title && (
                                <span className="text-neutral-500">
                                  {" "}
                                  · {item.placeName}
                                </span>
                              )}
                          </p>
                          {item.why && (
                            <p className="text-xs text-neutral-500">
                              {item.why}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Before you go */}
      {prep && (
        <section className="mt-10 break-inside-avoid">
          <h2 className="text-xl font-bold tracking-tight">Before you go</h2>

          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {etiquette.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-primary">
                  Etiquette &amp; tips
                </h3>
                <ul className="mt-1.5 space-y-1 text-sm text-neutral-700">
                  {etiquette.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-primary">•</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-5">
              {documents.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-primary">
                    Documents to carry
                  </h3>
                  <ul className="mt-1.5 space-y-1 text-sm text-neutral-700">
                    {documents.map((d, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-neutral-400">☐</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {phrases.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-primary">
                    Handy phrases
                  </h3>
                  <ul className="mt-1.5 space-y-1 text-sm text-neutral-700">
                    {phrases.map((p, i) => (
                      <li key={i}>
                        <span className="font-medium">{p.phrase}</span>
                        <span className="text-neutral-500"> — {p.meaning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {packing.length > 0 && (
            <div className="mt-6 break-inside-avoid">
              <h3 className="text-sm font-semibold text-primary">Packing list</h3>
              <div className="mt-2 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {packing.map((cat, i) => (
                  <div key={i} className="break-inside-avoid">
                    <p className="text-sm font-medium">{cat.category}</p>
                    <ul className="mt-1 space-y-0.5 text-sm text-neutral-700">
                      {cat.items.map((item, j) => (
                        <li key={j} className="flex gap-2">
                          <span className="text-neutral-400">☐</span>
                          {item}
                        </li>
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
        <p className="mt-8 text-neutral-500">
          Nothing to print yet — generate the itinerary and prep guide first.
        </p>
      )}

      <footer className="mt-12 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-400">
        Generated with Trippo · {format(new Date(), "d MMM yyyy")}
      </footer>
    </div>
  )
}
