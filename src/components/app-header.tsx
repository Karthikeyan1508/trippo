"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Settings } from "lucide-react"
import { cn } from "cn"

import { Logo } from "@/components/logo"
import { AccountMenuItems, type AccountUser } from "@/components/account-menu"
import { initialsOf } from "@/lib/initials"
import { ThemeToggleButton } from "@/components/theme-switcher"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const NAV = [
  { href: "/dashboard", label: "Trips", icon: Compass },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function AppHeader({ user }: { user: AccountUser }) {
  const pathname = usePathname()

  // Trip pages render their own full-height sidebar chrome (with the same
  // account menu in its footer), so a second bar would be redundant.
  if (/^\/trips\/[^/]+/.test(pathname)) return null

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Logo href="/dashboard" />
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 px-3 text-xs font-medium tracking-wider uppercase transition-colors",
                    "text-muted-foreground hover:text-foreground",
                    active && "text-foreground shadow-[inset_0_-2px_0_0_var(--primary)]"
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggleButton />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label="Account menu"
              >
                <Avatar className="size-9">
                  <AvatarImage src={user.image ?? undefined} alt={user.name ?? "You"} />
                  <AvatarFallback>{initialsOf(user)}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <AccountMenuItems user={user} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
