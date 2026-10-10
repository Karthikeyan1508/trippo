"use client"

import * as React from "react"
import { Check, ExternalLink, Loader2, Plus, Star } from "lucide-react"

import { productUrl } from "@/lib/amazon"
import { formatMoney } from "@/lib/format"
import type { ProductLite } from "@/server/serpapi"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"

/** Compact "1,234" / "12.3K" so review counts never crowd the card. */
function compactCount(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

function SuggestPopover({
  product,
  onSuggest,
}: {
  product: ProductLite
  onSuggest: (product: ProductLite, note: string) => Promise<boolean>
}) {
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function submit() {
    startTransition(async () => {
      const ok = await onSuggest(product, note)
      if (ok) {
        setOpen(false)
        setNote("")
      }
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="flex-1 gap-1.5 px-2">
          <Plus className="size-4" />
          Suggest
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-medium">Why should the crew get this?</p>
          <p className="text-xs text-muted-foreground">
            Optional: a line helps people decide. Everyone can vote on it.
          </p>
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={240}
          placeholder="e.g. It's freezing at night in Manali"
          aria-label="Why this product"
        />
        <Button onClick={submit} disabled={pending} className="w-full gap-2">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Add to crew list
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** One search result. */
export function ProductCard({
  product,
  domain,
  currency,
  onList,
  onSuggest,
}: {
  product: ProductLite
  domain: string
  currency: string
  /** Already on the crew's list. */
  onList: boolean
  onSuggest: (product: ProductLite, note: string) => Promise<boolean>
}) {
  return (
    <article className="group flex flex-col border bg-card transition-colors hover:border-foreground/30">
      <div className="relative aspect-square overflow-hidden bg-white">
        {/* Amazon's own CDN; next/image can't optimise third-party hosts. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-contain p-5 transition-transform duration-300 group-hover:scale-105"
        />
        {product.discountPct != null && product.discountPct >= 5 && (
          <span className="absolute top-0 left-0 bg-primary px-2.5 py-1 text-[11px] font-semibold tracking-wide text-primary-foreground">
            -{product.discountPct}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h4 className="line-clamp-2 text-sm leading-snug font-medium">{product.title}</h4>

        {product.rating != null && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            <span className="font-medium text-foreground">{product.rating}</span>
            {product.reviews != null && <span>({compactCount(product.reviews)})</span>}
          </p>
        )}
        {product.boughtLastMonth && (
          <p className="mt-1 text-xs text-brand">{product.boughtLastMonth}</p>
        )}

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">
            {product.price ?? "See price"}
          </span>
          {product.oldPriceValue != null && product.discountPct != null && (
            <span className="text-xs text-muted-foreground line-through">
              {formatMoney(product.oldPriceValue, currency)}
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {onList ? (
            <Button variant="secondary" disabled className="flex-1 gap-1.5">
              <Check className="size-4" />
              On crew list
            </Button>
          ) : (
            <SuggestPopover product={product} onSuggest={onSuggest} />
          )}
          <Button asChild variant="outline" size="icon" aria-label="View on Amazon">
            <a
              href={productUrl(domain, product.asin)}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </div>
    </article>
  )
}
