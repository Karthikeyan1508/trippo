"use client"

import * as React from "react"
import {
  BedDouble,
  Check,
  ExternalLink,
  Loader2,
  Navigation,
  Phone,
  RefreshCw,
  Search,
  Star,
  Vote,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { createPoll } from "@/server/polls"
import { findTransport, refreshStayOptions, selectStay } from "@/server/travel-options"
import type { TransportLite } from "@/server/serpapi"
import { safeHttpUrl, telHref } from "@/lib/safe-url"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTripTab } from "./trip-tabs"

type Stay = {
  id: string
  name: string
  price: string | null
  rating: number | null
  type: string | null
  amenities: string[]
  link: string | null
  phone: string | null
  thumbnail: string | null
  selected: boolean
}

function StayCard({
  stay,
  isAdmin,
  choosing,
  onChoose,
}: {
  stay: Stay
  isAdmin: boolean
  choosing: boolean
  onChoose: () => void
}) {
  const link = safeHttpUrl(stay.link)
  const tel = telHref(stay.phone)
  const thumb = safeHttpUrl(stay.thumbnail)

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card",
        stay.selected && "border-primary ring-1 ring-primary/30"
      )}
    >
      <div className="relative aspect-[16/9] bg-muted">
        {thumb ? (
          // Thumbnails come from arbitrary third-party hosts, so next/image can't optimise them.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <BedDouble className="size-8" />
          </div>
        )}
        {stay.selected && (
          <Badge className="absolute top-2 left-2 gap-1">
            <Check className="size-3" />
            Group choice
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 font-medium">{stay.name}</h4>
          {stay.rating != null && (
            <span className="flex shrink-0 items-center gap-1 text-sm">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {stay.rating}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {[stay.type, stay.price].filter(Boolean).join(" · ") || "Stay option"}
        </p>
        {stay.amenities.length > 0 && (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            {stay.amenities.slice(0, 4).join(" · ")}
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {link && (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={link} target="_blank" rel="noopener noreferrer">
                View & book
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
          {tel && (
            <Button asChild size="sm" variant="ghost" aria-label={`Call ${stay.name}`}>
              <a href={tel}>
                <Phone className="size-3.5" />
              </a>
            </Button>
          )}
          {isAdmin && !stay.selected && (
            <Button size="sm" onClick={onChoose} disabled={choosing} className="ml-auto">
              {choosing ? "Choosing…" : "Choose this"}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

export function TravelOptions({
  tripId,
  origin,
  destination,
  stays,
  isAdmin,
  canVote,
}: {
  tripId: string
  origin: string
  destination: string
  stays: Stay[]
  isAdmin: boolean
  canVote: boolean
}) {
  const { setTab } = useTripTab()
  const [from, setFrom] = React.useState(origin)
  const [to, setTo] = React.useState(destination)
  const [transport, setTransport] = React.useState<TransportLite[] | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [researching, setResearching] = React.useState(false)
  const [choosing, setChoosing] = React.useState<string | null>(null)
  const [polling, setPolling] = React.useState(false)

  async function search() {
    setSearching(true)
    const res = await findTransport(tripId, from, to)
    setSearching(false)
    if (!res.ok) return toast.error(res.error)
    setTransport(res.data)
  }

  async function researchStays() {
    setResearching(true)
    const res = await refreshStayOptions(tripId)
    setResearching(false)
    if (!res.ok) return toast.error(res.error)
    toast.success(`${res.data} stay options ready for the group.`)
  }

  async function choose(stayId: string) {
    setChoosing(stayId)
    const res = await selectStay(tripId, stayId)
    setChoosing(null)
    if (res.ok) toast.success("Group stay selected — it's used the next time you generate the plan.")
    else toast.error(res.error)
  }

  async function startVote() {
    setPolling(true)
    const res = await createPoll(
      tripId,
      "Where should we stay?",
      stays.map((s) => s.name)
    )
    setPolling(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Vote opened")
    setTab("decisions")
  }

  return (
    <div className="space-y-6 pt-5">
      <div>
        <h3 className="font-medium">Stay & transport</h3>
        <p className="text-sm text-muted-foreground">
          Shortlist where to sleep, vote on it, and find local rides.
        </p>
      </div>

      {/* Stay shortlist */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BedDouble className="size-5 text-brand" />
            <h4 className="font-medium">Stay shortlist</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {stays.length >= 2 && canVote && (
              <Button variant="outline" size="sm" onClick={startVote} disabled={polling} className="gap-1.5">
                {polling ? <Loader2 className="size-4 animate-spin" /> : <Vote className="size-4" />}
                Put it to a vote
              </Button>
            )}
            {isAdmin && stays.length > 0 && (
              <Button variant="ghost" size="sm" onClick={researchStays} disabled={researching} className="gap-1.5">
                <RefreshCw className={cn("size-4", researching && "animate-spin")} />
                Refresh
              </Button>
            )}
          </div>
        </div>

        {stays.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No shortlist yet. Trippo finds the three best-fit stays for your dates.
            </p>
            {isAdmin ? (
              <Button onClick={researchStays} disabled={researching} className="mt-4 gap-2">
                {researching && <Loader2 className="size-4 animate-spin" />}
                Find top 3 stays
              </Button>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">The admin can generate it.</p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stays.map((stay) => (
              <StayCard
                key={stay.id}
                stay={stay}
                isAdmin={isAdmin}
                choosing={choosing === stay.id}
                onChoose={() => choose(stay.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Local transport */}
      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <Navigation className="size-5 text-brand" />
          <h4 className="font-medium">Local transport</h4>
        </div>
        <p className="text-sm text-muted-foreground">
          Find cabs, rentals and transfers for any leg of the trip.
        </p>

        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            void search()
          }}
        >
          <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" aria-label="From" />
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" aria-label="To" />
          <Button type="submit" disabled={searching} className="gap-2">
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Find options
          </Button>
        </form>

        {transport && transport.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No local listings found — try a more specific start or end point.
          </p>
        )}
        {transport && transport.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-3">
            {transport.map((option, i) => {
              const link = safeHttpUrl(option.link)
              const tel = telHref(option.phone)
              return (
                <li key={`${option.name}-${i}`} className="flex flex-col rounded-xl border bg-muted/20 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{option.name}</p>
                    {option.rating != null && (
                      <span className="flex shrink-0 items-center gap-1 text-sm">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" />
                        {option.rating}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {option.mode ?? option.address ?? "Local transport"}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    {link && (
                      <Button asChild size="sm" variant="outline" className="gap-1.5">
                        <a href={link} target="_blank" rel="noopener noreferrer">
                          Details
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    )}
                    {tel && (
                      <Button asChild size="sm" variant="ghost" className="gap-1.5">
                        <a href={tel}>
                          <Phone className="size-3.5" />
                          {option.phone}
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
