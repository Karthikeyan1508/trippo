"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { CornerDownLeft, LayoutDashboard, Moon, Search, Settings, Sun } from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { NAV_GROUPS } from "./nav-config"
import { useTripTab } from "./trip-tabs"

/** Header search button + the Cmd/Ctrl-K palette for jumping around a trip. */
export function TripCommand({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const { setTab } = useTripTab()
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  function run(action: () => void) {
    setOpen(false)
    action()
  }

  const dark = resolvedTheme === "dark"

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden h-9 w-52 justify-start gap-2 bg-transparent font-normal text-muted-foreground xl:inline-flex"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Jump to…</span>
        <kbd className="border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium tracking-wider">
          Ctrl K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="xl:hidden"
        aria-label="Search"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Jump to a section"
        description="Search sections and actions"
      >
        <CommandInput placeholder="Where to? Try budget or crew…" />
        <CommandList>
          <CommandEmpty>Nothing matches that.</CommandEmpty>
          {NAV_GROUPS.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items
                .filter((item) => !item.adminOnly || isAdmin)
                .map((item) => (
                  <CommandItem
                    key={item.value}
                    value={`${group.label} ${item.label}`}
                    onSelect={() => run(() => setTab(item.value))}
                  >
                    {item.label}
                    <CornerDownLeft className="ml-auto size-3.5 opacity-40" />
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => run(() => router.push("/dashboard"))}>
              <LayoutDashboard className="size-4" />
              All trips
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/settings"))}>
              <Settings className="size-4" />
              Settings
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme(dark ? "light" : "dark"))}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              Switch to {dark ? "light" : "dark"} mode
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
