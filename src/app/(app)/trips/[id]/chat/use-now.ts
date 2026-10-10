"use client"

import * as React from "react"

/** A clock that re-renders on an interval (null until mounted), for "closes in 2 h". */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState<number | null>(null)
  React.useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, intervalMs)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [intervalMs])
  return now
}
