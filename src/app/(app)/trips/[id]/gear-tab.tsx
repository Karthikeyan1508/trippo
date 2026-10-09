"use client"

import * as React from "react"
import { BadgePercent, Loader2, PackageSearch, Search, Sparkles, Star } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import {
  SORT_OPTIONS,
  amazonDomainFor,
  type SortValue,
} from "@/lib/amazon"
import type { GearIdea, PickData } from "@/lib/gear"
import {
  addProductToMyChecklist,
  getGearIdeas,
  removeProduct,
  searchProducts,
  suggestProduct,
  toggleProductVote,
} from "@/server/products"
import type { ProductLite } from "@/server/serpapi"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { CrewPicks, type Voter } from "./crew-picks"
import { ProductCard } from "./product-card"
import { useTripTab } from "./trip-tabs"

type Results = { query: string; sort: SortValue; domain: string; products: ProductLite[] }

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 border px-3 text-xs font-medium tracking-wide whitespace-nowrap uppercase transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

export function GearTab({
  tripId,
  tripName,
  currency,
  viewerId,
  isAdmin,
  members,
  initialPicks,
}: {
  tripId: string
  tripName: string
  currency: string
  viewerId: string
  isAdmin: boolean
  members: Voter[]
  initialPicks: PickData[]
}) {
  const { tab } = useTripTab()
  const domain = amazonDomainFor(currency)

  // ── Crew picks: optimistic copy that re-syncs whenever the server sends fresh data ──
  const [picks, setPicks] = React.useState(initialPicks)
  const [seenPicks, setSeenPicks] = React.useState(initialPicks)
  if (initialPicks !== seenPicks) {
    setSeenPicks(initialPicks)
    setPicks(initialPicks)
  }

  // Narrow screens show one pane at a time; from xl both sit side by side.
  const [view, setView] = React.useState<"discover" | "picks">("discover")

  // ── AI / fallback ideas, fetched the first time this section is opened ──
  const [ideas, setIdeas] = React.useState<GearIdea[] | null>(null)
  const ideasRequested = React.useRef(false)
  React.useEffect(() => {
    if (tab !== "gear" || ideasRequested.current) return
    ideasRequested.current = true
    getGearIdeas(tripId).then((res) => setIdeas(res.ok ? res.data : []))
  }, [tab, tripId])

  // ── Search ──
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<SortValue>("relevance")
  const [results, setResults] = React.useState<Results | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [onSaleOnly, setOnSaleOnly] = React.useState(false)
  const [topRatedOnly, setTopRatedOnly] = React.useState(false)

  async function runSearch(rawQuery: string, nextSort: SortValue = sort) {
    const q = rawQuery.trim()
    if (q.length < 2) return
    setQuery(q)
    setSearching(true)
    const res = await searchProducts(tripId, q, nextSort)
    setSearching(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setResults({ query: q, sort: nextSort, domain: res.data.domain, products: res.data.products })
  }

  const visible = (results?.products ?? []).filter(
    (p) =>
      (!onSaleOnly || (p.discountPct ?? 0) >= 5) && (!topRatedOnly || (p.rating ?? 0) >= 4)
  )

  // ── Crew actions ──
  const onList = new Set(picks.map((p) => p.asin))

  async function suggest(product: ProductLite, note: string) {
    const res = await suggestProduct(
      tripId,
      {
        asin: product.asin,
        title: product.title,
        price: product.price,
        priceValue: product.priceValue,
        rating: product.rating,
        reviews: product.reviews,
        image: product.image,
        query: results?.query,
      },
      note
    )
    if (!res.ok) {
      toast.error(res.error)
      return false
    }
    const pick = res.data
    setPicks((prev) =>
      prev.some((p) => p.id === pick.id) ? prev.map((p) => (p.id === pick.id ? pick : p)) : [pick, ...prev]
    )
    toast.success("Suggested to the crew", {
      action: { label: "View list", onClick: () => setView("picks") },
    })
    return true
  }

  function flipVote(id: string) {
    setPicks((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              voterIds: p.voterIds.includes(viewerId)
                ? p.voterIds.filter((v) => v !== viewerId)
                : [...p.voterIds, viewerId],
            }
          : p
      )
    )
  }

  async function vote(id: string) {
    flipVote(id) // instant feedback
    const res = await toggleProductVote(id)
    if (!res.ok) {
      flipVote(id) // put it back
      toast.error(res.error)
    }
  }

  async function addToChecklist(id: string) {
    const res = await addProductToMyChecklist(id)
    if (!res.ok) toast.error(res.error)
    else
      toast.success(
        res.data.added ? "Added to your packing list" : "Already on your packing list"
      )
  }

  async function remove(id: string) {
    const before = picks
    setPicks((prev) => prev.filter((p) => p.id !== id))
    const res = await removeProduct(id)
    if (!res.ok) {
      setPicks(before)
      toast.error(res.error)
    }
  }

  const showingResults = results !== null || searching

  return (
    <div className="space-y-6 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-medium">Gear & shopping</h3>
          <p className="text-sm text-muted-foreground">
            Search {domain}, suggest what {tripName} needs, and let the crew vote on what&apos;s worth packing.
          </p>
        </div>

        {/* Pane switcher for screens too narrow for two columns */}
        <div className="flex border xl:hidden" role="group" aria-label="Gear view">
          {(
            [
              ["discover", "Discover"],
              ["picks", `Crew picks · ${picks.length}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                "h-9 px-4 text-xs font-medium tracking-wide uppercase transition-colors",
                view === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        {/* ───────── Discover ───────── */}
        <div className={cn("min-w-0 space-y-6", view !== "discover" && "hidden xl:block")}>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              void runSearch(query)
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products — “trekking shoes”, “power bank”…"
                aria-label="Search products"
                className="h-11 pl-9"
                maxLength={100}
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={sort}
                onValueChange={(v) => {
                  setSort(v as SortValue)
                  if (results) void runSearch(results.query, v as SortValue)
                }}
              >
                <SelectTrigger className="h-11 w-full sm:w-44" aria-label="Sort results">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" size="lg" className="h-11 gap-2 px-5" disabled={searching || query.trim().length < 2}>
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Search
              </Button>
            </div>
          </form>

          {/* Ideas tailored to this trip */}
          <section aria-label="Suggested for this trip">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-brand" />
              <h4 className="text-xs font-semibold tracking-[0.15em] uppercase">Suggested for this trip</h4>
            </div>
            {ideas === null ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : (
              <div
                className={cn(
                  showingResults
                    ? "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                    : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                )}
              >
                {ideas.map((idea) =>
                  showingResults ? (
                    <FilterChip
                      key={idea.query}
                      active={results?.query === idea.query}
                      onClick={() => void runSearch(idea.query)}
                    >
                      {idea.label}
                    </FilterChip>
                  ) : (
                    <button
                      key={idea.query}
                      type="button"
                      onClick={() => void runSearch(idea.query)}
                      className="group flex flex-col items-start gap-2 border bg-card p-4 text-left transition-colors hover:border-primary"
                    >
                      <span className="flex w-full items-center justify-between gap-2 text-sm font-medium">
                        {idea.label}
                        <Search className="size-3.5 text-muted-foreground transition-colors group-hover:text-brand" />
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">{idea.reason}</span>
                    </button>
                  )
                )}
              </div>
            )}
          </section>

          {/* Results */}
          {showingResults && (
            <section aria-live="polite">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {searching
                    ? "Searching…"
                    : `${visible.length} result${visible.length === 1 ? "" : "s"} for “${results?.query}”`}
                </p>
                <div className="flex gap-2">
                  <FilterChip active={onSaleOnly} onClick={() => setOnSaleOnly((v) => !v)}>
                    <BadgePercent className="size-3.5" />
                    On sale
                  </FilterChip>
                  <FilterChip active={topRatedOnly} onClick={() => setTopRatedOnly((v) => !v)}>
                    <Star className="size-3.5" />4+ stars
                  </FilterChip>
                </div>
              </div>

              {searching ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-96" />
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <div className="border border-dashed bg-card/50 px-6 py-14 text-center">
                  <PackageSearch className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">Nothing matches</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try a broader search, or switch off a filter.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                  {visible.map((product) => (
                    <ProductCard
                      key={product.asin}
                      product={product}
                      domain={results?.domain ?? domain}
                      currency={currency}
                      onList={onList.has(product.asin)}
                      onSuggest={suggest}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* ───────── Crew picks ───────── */}
        <div className={cn("xl:sticky xl:top-[4.5rem]", view !== "picks" && "hidden xl:block")}>
          <CrewPicks
            picks={picks}
            members={members}
            viewerId={viewerId}
            isAdmin={isAdmin}
            currency={currency}
            onVote={vote}
            onChecklist={addToChecklist}
            onRemove={remove}
            onBrowse={() => setView("discover")}
          />
        </div>
      </div>
    </div>
  )
}
