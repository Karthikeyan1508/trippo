"use client"

import Link from "next/link"
import { LayoutDashboard, LogOut, Settings } from "lucide-react"

import { clearOfflineData } from "@/lib/offline"
import { signOutAction } from "@/server/auth-actions"
import { ThemeMenu } from "@/components/theme-switcher"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export type AccountUser = {
  name?: string | null
  email?: string | null
  image?: string | null
}

/**
 * Body of the signed-in user's dropdown — shared by the app header and the
 * trip sidebar so the account actions are identical everywhere.
 */
export function AccountMenuItems({ user }: { user: AccountUser }) {
  return (
    <>
      <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
        <span className="truncate text-sm font-medium">{user.name ?? "Traveller"}</span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard className="size-4" />
            All trips
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <ThemeMenu />
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={(e) => {
          e.preventDefault()
          // Wipe the offline copy of this person's trips before leaving.
          void clearOfflineData().then(() => signOutAction())
        }}
      >
        <LogOut className="size-4" />
        Sign out
      </DropdownMenuItem>
    </>
  )
}
