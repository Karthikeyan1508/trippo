import { format } from "date-fns"
import { Palette, Smartphone, UserRound } from "lucide-react"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { initialsOf } from "@/lib/initials"
import { ThemeCards } from "@/components/theme-switcher"
import { PushToggle } from "@/components/push-toggle"
import { TripModeControls } from "@/components/trip-mode-controls"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ClearOfflineButton, SignOutButton } from "./device-settings"

export const metadata = { title: "Settings — Trippo" }

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-brand">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export default async function SettingsPage() {
  const user = await requireUser()
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true, _count: { select: { memberships: true } } },
  })
  const trips = account?._count.memberships ?? 0

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        Your account
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Settings</h1>

      <div className="mt-8 space-y-6">
        <Section
          icon={UserRound}
          title="Profile"
          description="This is how your crew sees you on trips."
        >
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? "You"} />
              <AvatarFallback className="text-lg">{initialsOf(user)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-lg font-medium">{user.name ?? "Traveller"}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {trips} {trips === 1 ? "trip" : "trips"}
                {account && <> · member since {format(account.createdAt, "MMM yyyy")}</>}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Your name and photo come from your Google account. Change them there and
            they&apos;ll update here the next time you sign in.
          </p>
        </Section>

        <Section
          icon={Palette}
          title="Appearance"
          description="Choose how Trippo looks. System follows your device, including at night."
        >
          <ThemeCards />
        </Section>

        <Section
          icon={Smartphone}
          title="This device"
          description="Push notifications, installing Trippo, and what's saved for offline use."
        >
          <div className="space-y-5">
            <PushToggle />
            <div className="border-t pt-5">
              <TripModeControls />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <p className="max-w-md text-sm text-muted-foreground">
                Trip pages you open are saved so they work without signal. They&apos;re
                removed automatically when you sign out.
              </p>
              <ClearOfflineButton />
            </div>
          </div>
        </Section>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4">
          <div>
            <p className="text-sm font-medium">Sign out of Trippo</p>
            <p className="text-sm text-muted-foreground">You can sign back in any time.</p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
