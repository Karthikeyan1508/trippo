"use client"

import { Compass } from "lucide-react"
import { cn } from "cn"

import type { ChatAuthor } from "@/lib/chat"
import { initialsOf } from "@/lib/initials"

/** A person's picture (or initials) in the square style the app uses. */
export function PersonAvatar({
  person,
  size = 32,
  className,
}: {
  person: Pick<ChatAuthor, "name" | "image"> | null
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn("relative grid shrink-0 place-items-center overflow-hidden bg-muted text-[11px] font-medium text-muted-foreground", className)}
      style={{ width: size, height: size }}
    >
      {person?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initialsOf({ name: person?.name })
      )}
    </span>
  )
}

/** Trippo's mark: the brand compass on lime. */
export function TrippoAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center bg-primary text-primary-foreground", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Compass style={{ width: size * 0.58, height: size * 0.58 }} />
    </span>
  )
}
