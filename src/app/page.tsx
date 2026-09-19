import Link from "next/link"
import {
  ArrowRight,
  CalendarCheck,
  MapPin,
  Sparkles,
  Users,
  Wallet,
  ListChecks,
  Vote,
  Plane,
} from "lucide-react"

import { auth } from "@/auth"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const features = [
  {
    icon: Users,
    title: "Group preferences",
    description:
      "Everyone fills a quick form — diet, budget, stay, interests. The admin sees it all aggregated.",
  },
  {
    icon: Vote,
    title: "Consensus, not chaos",
    description:
      "Polls and votes settle the contentious calls before a single booking is made.",
  },
  {
    icon: Sparkles,
    title: "AI itineraries",
    description:
      "Real flight, hotel and place data becomes a balanced day-by-day plan you can actually follow.",
  },
  {
    icon: CalendarCheck,
    title: "Approve & lock",
    description:
      "The group approves the plan, then gets checklists, etiquette guides and a shareable PDF.",
  },
  {
    icon: MapPin,
    title: "Live trip map",
    description:
      "See where everyone is, drop checkpoints, and get a nudge if someone drops off the grid.",
  },
  {
    icon: Wallet,
    title: "Shared budget",
    description:
      "Log expenses, split any way, and settle up with who-owes-whom worked out automatically.",
  },
]

const phases = [
  "Create the trip",
  "Collect preferences",
  "Reach consensus",
  "Generate the plan",
  "Approve & prep",
  "Travel together",
]

export default async function LandingPage() {
  const session = await auth()
  const isLoggedIn = !!session?.user
  const primaryHref = isLoggedIn ? "/dashboard" : "/login"

  return (
    <div className="flex min-h-full flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={primaryHref}>
                {isLoggedIn ? "Dashboard" : "Get started"}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_-10%,color-mix(in_oklch,var(--primary),transparent_82%),transparent)]"
        />
        <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-16 text-center sm:pt-28">
          <Badge variant="secondary" className="mb-5 gap-1.5">
            <Plane className="size-3.5" />
            One app for the whole group trip
          </Badge>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Group trips, minus the group chat chaos.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
            Trippo is the single source of truth for planning a trip with
            friends — from “where should we go?” to “who owes whom ₹340?” to
            “where is everyone right now?”
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href={primaryHref}>
                Start planning free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#how">See how it works</Link>
            </Button>
          </div>

          {/* Phase strip */}
          <div className="mx-auto mt-14 flex max-w-4xl flex-wrap items-center justify-center gap-x-2 gap-y-3 text-sm text-muted-foreground">
            {phases.map((phase, i) => (
              <div key={phase} className="flex items-center gap-2">
                <span className="rounded-full border bg-card px-3 py-1 font-medium text-foreground">
                  {phase}
                </span>
                {i < phases.length - 1 && (
                  <ArrowRight className="size-4 opacity-40" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how" className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything a group trip needs, in one place
          </h2>
          <p className="mt-2 text-muted-foreground">
            No more juggling ten apps, three spreadsheets and a lost WhatsApp
            thread.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="mb-4 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20">
        <div className="relative overflow-hidden rounded-2xl border bg-card p-8 text-center sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_80%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_85%),transparent)]"
          />
          <ListChecks className="mx-auto mb-4 size-8 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Your next trip starts here
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Create a trip, invite your crew, and let everyone shape the plan
            together.
          </p>
          <Button asChild size="lg" className="mt-6 gap-2">
            <Link href={primaryHref}>
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <p>Built for the SerpApi Hackathon · Travel &amp; Local Discovery</p>
        </div>
      </footer>
    </div>
  )
}
