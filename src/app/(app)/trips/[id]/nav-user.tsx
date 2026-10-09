"use client"

import { ChevronsUpDown } from "lucide-react"

import { AccountMenuItems, type AccountUser } from "@/components/account-menu"
import { initialsOf } from "@/lib/initials"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

/** Account card pinned to the bottom of the trip sidebar. */
export function NavUser({ user }: { user: AccountUser }) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={user.name ?? "Account"}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? "You"} />
                <AvatarFallback>{initialsOf(user)}</AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate text-left text-sm font-medium">
                {user.name ?? "Traveller"}
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
            side={isMobile ? "bottom" : "top"}
            align="end"
            sideOffset={6}
          >
            <AccountMenuItems user={user} />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
