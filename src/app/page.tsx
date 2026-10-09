import Link from "next/link"
import {
  ArrowRight,
  Check,
  Compass,
  MapPin,
  Sparkles,
  UsersRound,
  Vote,
  Wallet,
  ListChecks,
  Route,
} from "lucide-react"

import { auth } from "@/auth"
import { Logo } from "@/components/logo"
import { ThemeToggleButton } from "@/components/theme-switcher"
import { TripCover } from "@/components/trip-cover"
import { Button } from "@/components/ui/button"

const journey = [
  {
    title: "Invite",
    body: "Share one link in the group chat. Friends sign in and land straight on the trip.",
  },
  {
    title: "Share",
    body: "Everyone answers a two-minute form: diet, pace, budget, interests, access needs.",
  },
  {
    title: "Plan",
    body: "Real places from live search become a balanced day-by-day itinerary you can edit.",
  },
  {
    title: "Approve",
    body: "Everyone votes. The plan locks the moment the whole crew agrees.",
  },
  {
    title: "Go",
    body: "Packing lists, a live map, a shared budget and a settle-up that does the maths.",
  },
]

const features = [
  {
    icon: UsersRound,
    title: "One crew, one source of truth",
    body: "Roles for admins, members and observers, plus a clear view of who's ready.",
  },
  {
    icon: Sparkles,
    title: "Plans from real places",
    body: "Live search data, shaped by what the group actually said they want.",
  },
  {
    icon: Vote,
    title: "Decisions, settled",
    body: "Polls and approvals end the “so are we doing it?” threads.",
  },
  {
    icon: Route,
    title: "A map that matches the list",
    body: "Numbered stops on the map, in the same order as the plan.",
  },
  {
    icon: ListChecks,
    title: "Prep without the panic",
    body: "Local etiquette, useful phrases and a private packing checklist.",
  },
  {
    icon: Wallet,
    title: "Money, minus the awkwardness",
    body: "Log expenses, split any way, settle up in the fewest payments.",
  },
]

/** A static, illustrative slice of the product, the "money shot" of the hero. */
function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="border bg-card shadow-2xl shadow-black/10 dark:shadow-black/40">
        <TripCover className="flex h-44 flex-col justify-between p-5">
          <span className="w-fit bg-primary px-2.5 py-1 text-[10px] font-medium tracking-widest text-primary-foreground uppercase">
            In 6 days
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-widest text-white/80 uppercase">
              <MapPin className="size-3.5" />
              Goa, India
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">Goa Reunion 2026</h3>
          </div>
        </TripCover>

        <div className="space-y-6 p-5">
          <div>
            <div className="mb-3 flex items-center justify-between text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
              <span>Journey</span>
              <span>4 of 5</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={i < 4 ? "h-1.5 bg-primary" : "h-1.5 bg-foreground/15"} />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-y py-4">
            <div>
              <p className="text-sm font-medium">Approval</p>
              <p className="text-xs text-muted-foreground">3 of 4 crew approved</p>
            </div>
            <div className="flex -space-x-1.5">
              {["A", "M", "S", "R"].map((n, i) => (
                <span
                  key={n}
                  className={
                    "grid size-8 place-items-center border-2 border-card text-xs font-medium " +
                    (i < 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
                  }
                >
                  {n}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center bg-primary/20 text-brand">
                <Sparkles className="size-4" />
              </span>
              <div>
                <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                  Your move
                </p>
                <p className="text-sm font-medium">Review the plan and vote</p>
              </div>
            </div>
            <span className="bg-primary px-3 py-2 text-[11px] font-medium tracking-wider text-primary-foreground uppercase">
              Open
            </span>
          </div>
        </div>
      </div>

      {/* Floating glass chips */}
      <div className="absolute -top-4 -right-2 hidden items-center gap-2 border bg-card px-3 py-2 text-xs font-medium shadow-lg sm:flex lg:-right-6">
        <span className="grid size-5 place-items-center bg-emerald-500 text-white">
          <Check className="size-3" />
        </span>
        Plan locked
      </div>
      <div className="absolute -bottom-5 -left-2 hidden items-center gap-2 border bg-card px-3 py-2 text-xs font-medium shadow-lg sm:flex lg:-left-8">
        <Wallet className="size-4 text-brand" />
        ₹340 settled with Riya
      </div>
    </div>
  )
}

export default async function LandingPage() {
  const session = await auth()
  const isLoggedIn = !!session?.user
  const primaryHref = isLoggedIn ? "/dashboard" : "/login"

  return (
    <div className="flex min-h-full flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-8 text-xs font-medium tracking-wider uppercase md:flex">
            <a href="#how" className="text-muted-foreground transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">
              Features
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            {!isLoggedIn && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href={primaryHref}>{isLoggedIn ? "Dashboard" : "Get started"}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-16 pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24">
        <div>
          <p className="inline-flex items-center gap-2 border bg-card px-3 py-1.5 text-[11px] font-medium tracking-widest uppercase">
            <Compass className="size-3.5 text-brand" />
            Group travel, in sync
          </p>
          <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Group trips, minus the group-chat chaos.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            One place to go from “where should we go?” to “who owes whom ₹340?”:
            preferences, a plan built from real places, votes, prep, a live map and a
            shared budget.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 gap-2 px-6">
              <Link href={primaryHref}>
                Start planning free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <a href="#how">See how it works</a>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Free to use · Sign in with Google · Works on your phone
          </p>
        </div>

        <ProductPreview />
      </section>

      {/* How it works */}
      <section id="how" className="border-y bg-card/40 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-6xl px-4 py-24">
          <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
            How it works
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            From a spark of an idea to everyone on the same page.
          </h2>

          <ol className="mt-14 grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-5">
            {journey.map((step, i) => (
              <li key={step.title} className="flex flex-col bg-background/70 p-6 backdrop-blur-md">
                <span className="text-4xl font-semibold tracking-tight text-brand tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-24">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          Everything in one place
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          No more juggling ten apps and a lost chat thread.
        </h2>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group border bg-card p-6 transition-colors hover:border-foreground/30"
            >
              <span className="grid size-11 place-items-center bg-primary/20 text-brand transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-6 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24">
        <div className="relative overflow-hidden border bg-card p-10 text-center sm:p-16">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(60%_90%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_70%),transparent)]"
          />
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Your next trip starts with one link.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Create a trip, send the invite, and let everyone shape the plan together.
          </p>
          <Button asChild size="lg" className="mt-9 h-12 gap-2 px-7">
            <Link href={primaryHref}>
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <p className="text-xs tracking-wider uppercase">
            Built for the SerpApi Hackathon · Travel &amp; Local Discovery
          </p>
        </div>
      </footer>
    </div>
  )
}
