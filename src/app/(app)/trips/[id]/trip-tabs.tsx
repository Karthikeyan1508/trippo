"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Tabs as TabsPrimitive } from "radix-ui"

type TripTabContextValue = { tab: string; setTab: (tab: string) => void }

const TripTabContext = React.createContext<TripTabContextValue | null>(null)

export function useTripTab() {
  const ctx = React.useContext(TripTabContext)
  if (!ctx) throw new Error("useTripTab must be used inside <TripTabs>")
  return ctx
}

/**
 * Radix Tabs whose active section lives in the URL (`?tab=itinerary`).
 *
 * That makes every section deep-linkable and keeps refresh / back / forward
 * working. Switching uses the native History API — Next.js syncs it with
 * `useSearchParams`, so there is no server round-trip per click.
 */
export function TripTabs({
  defaultTab,
  allowed,
  children,
}: {
  defaultTab: string
  allowed: string[]
  children: React.ReactNode
}) {
  const searchParams = useSearchParams()
  const requested = searchParams.get("tab")
  const tab = requested && allowed.includes(requested) ? requested : defaultTab

  const setTab = React.useCallback((next: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set("tab", next)
    window.history.pushState(null, "", `?${params.toString()}`)
    window.scrollTo({ top: 0 })
  }, [])

  const value = React.useMemo(() => ({ tab, setTab }), [tab, setTab])

  return (
    <TripTabContext.Provider value={value}>
      <TabsPrimitive.Root
        value={tab}
        onValueChange={setTab}
        orientation="vertical"
        className="contents"
      >
        {children}
      </TabsPrimitive.Root>
    </TripTabContext.Provider>
  )
}

/**
 * A real link (`?tab=…`, so it can be opened in a new tab or copied) that
 * switches section in place. Compose with `<Button asChild>` for styling.
 */
export function TabLink({
  tab,
  onClick,
  children,
  ...props
}: { tab: string } & Omit<React.ComponentProps<"a">, "href">) {
  const { setTab } = useTripTab()
  return (
    <a
      {...props}
      href={`?tab=${tab}`}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        // Let ctrl/cmd/middle-click open the link normally.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return
        event.preventDefault()
        setTab(tab)
      }}
    >
      {children}
    </a>
  )
}
