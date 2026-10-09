"use client"

import * as React from "react"
import {
  ExternalLink,
  ListPlus,
  MoreHorizontal,
  ShoppingBag,
  Star,
  ThumbsUp,
  Trash2,
} from "lucide-react"
import { cn } from "cn"

import { formatMoney } from "@/lib/format"
import { initialsOf } from "@/lib/initials"
import { safeHttpUrl } from "@/lib/safe-url"
import type { PickData } from "@/lib/gear"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Names of everyone who said "I need this", for the avatar stack. */
export type Voter = { id: string; name: string; image: string | null }

function PickRow({
  pick,
  viewerId,
  canRemove,
  voters,
  onVote,
  onChecklist,
  onAskRemove,
}: {
  pick: PickData
  viewerId: string
  canRemove: boolean
  voters: Voter[]
  onVote: (id: string) => void
  onChecklist: (id: string) => void
  onAskRemove: (pick: PickData) => void
}) {
  const voted = pick.voterIds.includes(viewerId)
  const link = safeHttpUrl(pick.link)
  const shown = voters.slice(0, 4)
  const extra = voters.length - shown.length
  const suggester = pick.suggestedBy.id === viewerId ? "You" : pick.suggestedBy.name

  return (
    <li className="p-5">
      <div className="flex gap-4">
        <div className="size-[4.5rem] shrink-0 bg-white">
          {pick.image && (
            // Amazon's own CDN; next/image can't optimise third-party hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pick.image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full object-contain p-1.5"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm leading-snug font-medium">{pick.title}</h4>
          <p className="mt-1.5 flex items-center gap-2.5 text-sm">
            <span className="font-semibold">{pick.price ?? "—"}</span>
            {pick.rating != null && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="size-3 fill-amber-400 text-amber-400" />
                {pick.rating}
              </span>
            )}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="-mt-1 -mr-2 shrink-0 text-muted-foreground"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => onChecklist(pick.id)}>
              <ListPlus className="size-4" />
              Add to my packing list
            </DropdownMenuItem>
            {link && (
              <DropdownMenuItem asChild>
                <a href={link} target="_blank" rel="noopener noreferrer sponsored">
                  <ExternalLink className="size-4" />
                  View on Amazon
                </a>
              </DropdownMenuItem>
            )}
            {canRemove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onAskRemove(pick)}>
                  <Trash2 className="size-4" />
                  Remove from list
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {pick.note ? (
          <>
            <span className="text-foreground">“{pick.note}”</span>
            <span className="text-muted-foreground"> — {suggester}</span>
          </>
        ) : (
          <>Suggested by {suggester}</>
        )}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {shown.length > 0 && (
            <div className="flex -space-x-1.5">
              {shown.map((v) => (
                <Avatar key={v.id} className="size-6 border-2 border-card" title={v.name}>
                  <AvatarImage src={v.image ?? undefined} alt={v.name} />
                  <AvatarFallback className="text-[9px]">{initialsOf({ name: v.name })}</AvatarFallback>
                </Avatar>
              ))}
              {extra > 0 && (
                <span className="grid size-6 place-items-center border-2 border-card bg-muted text-[9px] font-medium">
                  +{extra}
                </span>
              )}
            </div>
          )}
          <span className="truncate text-xs text-muted-foreground">
            {pick.voterIds.length === 0
              ? "No votes yet"
              : `${pick.voterIds.length} ${pick.voterIds.length === 1 ? "needs" : "need"} this`}
          </span>
        </div>

        <Button
          size="sm"
          variant={voted ? "default" : "outline"}
          aria-pressed={voted}
          aria-label={voted ? "Remove my vote" : "I need this"}
          onClick={() => onVote(pick.id)}
          className="shrink-0 gap-1.5"
        >
          <ThumbsUp className={cn("size-3.5", voted && "fill-current")} />
          {voted ? "Needed" : "Need it"}
        </Button>
      </div>
    </li>
  )
}

/** The crew's shared shortlist, most-wanted first. */
export function CrewPicks({
  picks,
  members,
  viewerId,
  isAdmin,
  currency,
  onVote,
  onChecklist,
  onRemove,
  onBrowse,
}: {
  picks: PickData[]
  members: Voter[]
  viewerId: string
  isAdmin: boolean
  currency: string
  onVote: (id: string) => void
  onChecklist: (id: string) => void
  onRemove: (id: string) => void
  onBrowse: () => void
}) {
  const [removing, setRemoving] = React.useState<PickData | null>(null)

  const byId = new Map(members.map((m) => [m.id, m]))
  const sorted = [...picks].sort(
    (a, b) => b.voterIds.length - a.voterIds.length || b.createdAt.localeCompare(a.createdAt)
  )
  const total = picks.reduce((sum, p) => sum + (p.priceValue ?? 0), 0)

  return (
    <section className="flex max-h-[calc(100svh-7rem)] flex-col border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <ShoppingBag className="size-4 text-brand" />
          <h3 className="text-sm font-semibold tracking-[0.15em] uppercase">Crew picks</h3>
        </div>
        <span className="bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">{picks.length}</span>
      </header>

      {sorted.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-sm font-medium">Nothing on the list yet</p>
          <p className="mx-auto mt-2 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
            Search for gear and hit Suggest. Everyone can then vote on what&apos;s worth packing.
          </p>
          <Button variant="outline" size="sm" className="mt-5 xl:hidden" onClick={onBrowse}>
            Find something to suggest
          </Button>
        </div>
      ) : (
        <ul className="divide-y overflow-y-auto">
          {sorted.map((pick) => (
            <PickRow
              key={pick.id}
              pick={pick}
              viewerId={viewerId}
              canRemove={isAdmin || pick.suggestedBy.id === viewerId}
              voters={pick.voterIds.flatMap((id) => {
                const m = byId.get(id)
                return m ? [m] : []
              })}
              onVote={onVote}
              onChecklist={onChecklist}
              onAskRemove={setRemoving}
            />
          ))}
        </ul>
      )}

      {sorted.length > 0 && (
        <footer className="flex items-baseline justify-between gap-3 border-t px-5 py-3.5">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            Estimated · one of each
          </span>
          <span className="text-base font-semibold tabular-nums">{formatMoney(total, currency)}</span>
        </footer>
      )}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this item?</AlertDialogTitle>
            <AlertDialogDescription>
              “{removing?.title.slice(0, 80)}” and its votes come off the crew list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing) onRemove(removing.id)
                setRemoving(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
