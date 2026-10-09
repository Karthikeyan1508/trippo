"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"

export const THEME_OPTIONS: {
  value: "light" | "dark" | "system"
  label: string
  description: string
  icon: LucideIcon
}[] = [
  { value: "light", label: "Light", description: "Bright and airy", icon: Sun },
  { value: "dark", label: "Dark", description: "Easy on the eyes", icon: Moon },
  { value: "system", label: "System", description: "Match your device", icon: Monitor },
]

/** next-themes only knows the real theme on the client; avoid a hydration flash. */
function useMounted() {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

/** The three big selectable tiles used on the Settings page. */
export function ThemeCards() {
  const { theme = "system", setTheme } = useTheme()
  const mounted = useMounted()

  return (
    <div role="radiogroup" aria-label="Colour theme" className="grid gap-3 sm:grid-cols-3">
      {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => {
        const selected = mounted && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              "group relative flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors outline-none",
              "hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50",
              selected && "border-primary ring-1 ring-primary"
            )}
          >
            <ThemePreview mode={value} />
            <div className="flex items-center gap-2">
              <Icon className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              {selected && (
                <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** One miniature app window, drawn in a fixed colour mode. */
function PreviewWindow({ dark }: { dark: boolean }) {
  return (
    <div
      className={cn(
        "flex h-full flex-1 flex-col gap-1.5 p-2",
        dark ? "bg-[oklch(0.148_0.004_228.8)]" : "bg-white"
      )}
    >
      <div className="flex items-center gap-1">
        <span className="size-2 rounded-sm bg-[oklch(0.841_0.238_128.85)]" />
        <span className={cn("h-1.5 w-8 rounded-full", dark ? "bg-white/30" : "bg-black/20")} />
      </div>
      <div className={cn("h-7 rounded-md", dark ? "bg-white/10" : "bg-black/[0.06]")} />
      <div className="flex gap-1">
        <span className={cn("h-3 flex-1 rounded", dark ? "bg-white/10" : "bg-black/[0.06]")} />
        <span className="h-3 w-5 rounded bg-[oklch(0.841_0.238_128.85)]" />
      </div>
    </div>
  )
}

/** A miniature app in the given mode (System shows light and dark side by side). */
function ThemePreview({ mode }: { mode: "light" | "dark" | "system" }) {
  return (
    <div className="flex h-20 overflow-hidden rounded-lg border">
      {mode === "system" ? (
        <>
          <PreviewWindow dark={false} />
          <PreviewWindow dark />
        </>
      ) : (
        <PreviewWindow dark={mode === "dark"} />
      )}
    </div>
  )
}

/** "Theme" submenu for the account dropdowns. */
export function ThemeMenu() {
  const { theme = "system", setTheme } = useTheme()
  const mounted = useMounted()
  const Current = !mounted || theme === "system" ? Monitor : theme === "dark" ? Moon : Sun

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Current className="size-4" />
        Theme
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={mounted ? theme : "system"} onValueChange={setTheme}>
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="size-4" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/** One-tap light ⇄ dark switch for page headers. */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const isDark = mounted && resolvedTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
