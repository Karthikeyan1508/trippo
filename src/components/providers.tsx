"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "next-themes"

import { TooltipProvider } from "@/components/ui/tooltip"
import { PwaRuntime } from "@/components/pwa-runtime"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // `class` strategy matches the preset's `@custom-variant dark (.dark *)`.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SessionProvider>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <PwaRuntime />
      </SessionProvider>
    </ThemeProvider>
  )
}
