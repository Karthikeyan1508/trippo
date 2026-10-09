"use client"

import * as React from "react"
import { cn } from "cn"

/**
 * A destination "hero" surface for cards and headers.
 *
 * Shows the trip's photo when there is one, otherwise a topographic gradient
 * built from the theme's own greens. A dark scrim sits over both, so white
 * text placed on top is always readable.
 */
export function TripCover({
  src,
  className,
  children,
}: {
  src?: string | null
  className?: string
  children?: React.ReactNode
}) {
  const [failed, setFailed] = React.useState(false)
  const showPhoto = Boolean(src) && !failed

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-gradient-to-br from-chart-4 via-chart-5 to-[oklch(0.22_0.04_131)] text-white",
        className
      )}
    >
      {/* Contour lines — the fallback's "map" texture */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 opacity-80"
        style={{
          backgroundImage:
            "repeating-radial-gradient(circle at 78% 130%, transparent 0 18px, oklch(1 0 0 / 0.08) 18px 19px), radial-gradient(circle at 18% 12%, oklch(0.84 0.2 129 / 0.35), transparent 45%)",
        }}
      />
      {showPhoto && (
        // Third-party photo host, so next/image can't optimise it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/25 to-black/35"
      />
      {children}
    </div>
  )
}
