"use client"

import * as React from "react"
import { formatDistanceToNowStrict } from "date-fns"

/**
 * "5 minutes ago". It's computed in the browser (the server's clock and time
 * zone differ), so the server render holds the space and the real text
 * appears right after hydration — no mismatch warnings.
 */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  if (!mounted) return <span className={className} aria-hidden>&nbsp;</span>
  return (
    <time dateTime={iso} className={className}>
      {formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}
    </time>
  )
}
