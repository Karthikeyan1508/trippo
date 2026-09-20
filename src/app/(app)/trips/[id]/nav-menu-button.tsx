"use client"

import * as React from "react"

import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"

// Wraps SidebarMenuButton so that tapping a nav item on mobile also
// closes the off-canvas sidebar, revealing the selected section.
export function NavMenuButton(
  props: React.ComponentProps<typeof SidebarMenuButton>
) {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <SidebarMenuButton
      {...props}
      onClick={(e) => {
        props.onClick?.(e)
        if (isMobile) setOpenMobile(false)
      }}
    />
  )
}
