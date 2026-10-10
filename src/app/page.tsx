import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  Check,
  Clapperboard,
  Compass,
  MapPin,
  MessagesSquare,
  Route,
  Sparkles,
  Wallet,
} from "lucide-react"

import { auth } from "@/auth"
import { ChatDemo } from "@/components/landing/chat-demo"
import { EngineMarquee } from "@/components/landing/engine-marquee"
import { HeroGlobe } from "@/components/landing/globe-lazy"
import { JourneyRail } from "@/components/landing/journey-rail"
import { CountUp, Float, HeroWords, Reveal, ScrollProgress, SpotlightCard } from "@/components/landing/motion"
import { Logo } from "@/components/logo"
import { ThemeToggleButton } from "@/components/theme-switcher"
import { Button } from "@/components/ui/button"

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">{children}</p>
}

/** A little route with numbered stops, for the "route first" tile. */
function MiniRoute() {
  const stops = [
    { x: 24, y: 70, n: 1 },
    { x: 84, y: 28, n: 2 },
    { x: 150, y: 58, n: 3 },
    { x: 212, y: 20, n: 4 },
  ]
  return (
    <svg viewBox="0 0 236 90" className="h-28 w-full" aria-hidden>
      <path d="M24 70 C 50 70, 60 28, 84 28 S 126 58, 150 58 S 190 20, 212 20" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" className="text-foreground/25" />
      {stops.map((s) => (
        <g key={s.n}>
          <rect x={s.x - 10} y={s.y - 10} width="20" height="20" className="fill-primary" />
          <text x={s.x} y={s.y + 4} textAnchor="middle" className="fill-primary-foreground text-[11px] font-semibold">
            {s.n}
          </text>
        </g>
      ))}
    </svg>
  )
}

export default async function LandingPage() {
  const session = await auth()
  const isLoggedIn = !!session?.user
  const primaryHref = isLoggedIn ? "/dashboard" : "/login"

  return (
    <div className="flex min-h-full flex-col overflow-x-clip">
      {/* Nothing stays hidden if scripts are off. */}
      <noscript>
        <style>{`[data-word]{transform:none!important}`}</style>
      </noscript>

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-8 text-xs font-medium tracking-wider uppercase md:flex">
            <a href="#chat" className="text-muted-foreground transition-colors hover:text-foreground">
              Crew chat
            </a>
            <a href="#how" className="text-muted-foreground transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#serpapi" className="text-muted-foreground transition-colors hover:text-foreground">
              SerpApi
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            {!isLoggedIn && (
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href={primaryHref}>{isLoggedIn ? "Dashboard" : "Get started"}</Link>
            </Button>
          </div>
        </div>
        <ScrollProgress />
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-4 pt-14 pb-16 lg:grid-cols-[1fr_1fr] lg:pt-20 lg:pb-24">
          <div className="relative z-10">
            <p className="inline-flex items-center gap-2 border bg-card px-3 py-1.5 text-[11px] font-medium tracking-widest uppercase">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping bg-primary opacity-75" />
                <span className="relative inline-flex size-2 bg-primary" />
              </span>
              Group travel, in sync
            </p>
            <HeroWords
              className="mt-6 text-5xl leading-[1.02] font-semibold tracking-tight sm:text-6xl lg:text-[3.9rem]"
              lines={[{ text: "Group trips," }, { text: "minus the" }, { text: "group-chat chaos.", accent: true }]}
            />
            <Reveal className="mt-6" delay={500} distance={16}>
              <p className="max-w-lg text-lg leading-relaxed text-pretty text-muted-foreground">
                Plan together, decide together, go together. Preferences, a route-first itinerary, an AI that answers with live
                data, votes, a live map and a shared budget, in one place.
              </p>
            </Reveal>
            <Reveal className="mt-9 flex flex-col gap-3 sm:flex-row" delay={700} distance={16}>
              <Button asChild size="lg" className="h-12 gap-2 px-6">
                <Link href={primaryHref}>
                  Start planning free
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6">
                <a href="#chat">Watch it work</a>
              </Button>
            </Reveal>
            <p className="mt-6 text-sm text-muted-foreground">Free to use · Sign in with Google · Works on your phone</p>
          </div>

          {/* The globe: real land, real routes, drag to turn it. */}
          <div className="relative order-first mx-auto -mb-2 aspect-square w-full max-w-[19rem] sm:max-w-[34rem] lg:order-none lg:mx-0 lg:mb-0 lg:aspect-[1/1.02] lg:max-w-none">
            <HeroGlobe className="absolute -inset-4 sm:-inset-8 lg:-inset-10" />

            <Float className="absolute top-[8%] right-0 hidden sm:block" amplitude={7} duration={4600}>
              <div className="flex items-center gap-2 border bg-card px-3 py-2 text-xs font-medium shadow-lg">
                <span className="grid size-5 place-items-center bg-emerald-500 text-white">
                  <Check className="size-3" />
                </span>
                Plan locked
              </div>
            </Float>
            <Float className="absolute bottom-[14%] left-0 hidden sm:block" amplitude={9} duration={5200} delay={600}>
              <div className="flex items-center gap-2 border bg-card px-3 py-2 text-xs font-medium shadow-lg">
                <Wallet className="size-4 text-brand" />₹340 settled with Riya
              </div>
            </Float>
            <Float className="absolute top-[44%] -left-2 hidden lg:block" amplitude={6} duration={4000} delay={1200}>
              <div className="flex items-center gap-2 border bg-card px-3 py-2 text-xs font-medium shadow-lg">
                <MapPin className="size-4 text-brand" />
                BLR to CMB, flights planned
              </div>
            </Float>
          </div>
        </div>
      </section>

      {/* SerpApi strip */}
      <section id="serpapi" className="border-y bg-card/40 py-14 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-6xl px-4">
          <Reveal className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <Eyebrow>Powered by SerpApi</Eyebrow>
              <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Every hotel, fare, route and video comes from a live search.
              </h2>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              The AI chooses what to look up and writes a short note. It never supplies a fact itself, so there are no invented prices.
            </p>
          </Reveal>
          <EngineMarquee />
          <Reveal each className="mt-12 grid grid-cols-3 divide-x border bg-background/60 backdrop-blur-md">
            <div className="p-5 text-center sm:p-8">
              <p className="text-4xl font-semibold tracking-tight text-brand sm:text-5xl">
                <CountUp to={10} />
              </p>
              <p className="mt-2 text-xs tracking-wider text-muted-foreground uppercase">SerpApi engines</p>
            </div>
            <div className="p-5 text-center sm:p-8">
              <p className="text-4xl font-semibold tracking-tight text-brand sm:text-5xl">
                <CountUp to={0} />
              </p>
              <p className="mt-2 text-xs tracking-wider text-muted-foreground uppercase">Facts the AI invents</p>
            </div>
            <div className="p-5 text-center sm:p-8">
              <p className="text-4xl font-semibold tracking-tight text-brand sm:text-5xl">
                <CountUp to={7} suffix=" days" />
              </p>
              <p className="mt-2 text-xs tracking-wider text-muted-foreground uppercase">Results cached to save credits</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Crew chat */}
      <section id="chat" className="mx-auto w-full max-w-6xl px-4 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Reveal>
              <Eyebrow>The crew chat</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Ask @trippo. Get answers, not links.</h2>
              <p className="mt-5 text-lg leading-relaxed text-pretty text-muted-foreground">
                A group chat with an AI that searches for you. Hotels, ways to get from stop to stop, places to eat, videos about where
                you are going. Every result is a card the crew can act on.
              </p>
            </Reveal>
            <Reveal each className="mt-8 space-y-3">
              {[
                ["Add to the itinerary", "Admins add it in one tap. Members send a request the admin approves."],
                ["Put it to a vote", "Turn the cards into a private poll, right in the thread."],
                ["Devices hear about it", "Polls, mentions and replies reach phones. Plain chat stays quiet."],
              ].map(([title, body]) => (
                <div key={title} className="flex gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                  <p className="text-sm leading-relaxed">
                    <span className="font-semibold">{title}.</span> <span className="text-muted-foreground">{body}</span>
                  </p>
                </div>
              ))}
            </Reveal>
          </div>
          <ChatDemo />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y bg-card/40 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-6xl px-4 py-24">
          <Reveal>
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              From a spark of an idea to everyone on the same page.
            </h2>
          </Reveal>
          <div className="mt-14">
            <JourneyRail />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-24">
        <Reveal>
          <Eyebrow>Everything in one place</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            No more juggling ten apps and a lost chat thread.
          </h2>
        </Reveal>

        <Reveal each className="mt-14 grid gap-4 md:grid-cols-6">
          <SpotlightCard className="p-6 md:col-span-4">
            <span className="grid size-11 place-items-center bg-primary/20 text-brand">
              <Route className="size-5" />
            </span>
            <h3 className="mt-5 text-xl font-semibold">Plans built route first</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Trippo decides between flying and driving, picks real flights, places bases inside the destination and orders every day
              along the shortest path. Bengaluru to Colombo and back, with nothing that does not fit.
            </p>
            <div className="mt-4 border bg-background/50 p-4">
              <MiniRoute />
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-6 md:col-span-2">
            <span className="grid size-11 place-items-center bg-primary/20 text-brand">
              <BarChart3 className="size-5" />
            </span>
            <h3 className="mt-5 text-xl font-semibold">Decisions, settled</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Polls and approvals end the &ldquo;so are we doing it?&rdquo; threads. The plan locks when everyone agrees.</p>
            <div className="mt-5 space-y-2">
              {[
                ["Beach first", 62],
                ["Temples first", 38],
              ].map(([label, pct]) => (
                <div key={label} className="relative overflow-hidden border text-xs">
                  <span className="absolute inset-y-0 left-0 bg-primary/25" style={{ width: `${pct}%` }} />
                  <span className="relative flex justify-between px-2.5 py-1.5 font-medium">
                    {label}
                    <span className="text-muted-foreground tabular-nums">{pct}%</span>
                  </span>
                </div>
              ))}
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-6 md:col-span-2">
            <span className="grid size-11 place-items-center bg-primary/20 text-brand">
              <Wallet className="size-5" />
            </span>
            <h3 className="mt-5 text-xl font-semibold">Money, minus the awkwardness</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Log expenses, split any way, convert currencies, and settle up in the fewest payments.</p>
            <p className="mt-5 text-4xl font-semibold tracking-tight text-brand tabular-nums">
              <CountUp to={340} prefix="₹" />
            </p>
            <p className="text-xs text-muted-foreground">settled with Riya in one payment</p>
          </SpotlightCard>

          <SpotlightCard className="p-6 md:col-span-2">
            <span className="grid size-11 place-items-center bg-primary/20 text-brand">
              <MapPin className="size-5" />
            </span>
            <h3 className="mt-5 text-xl font-semibold">A live map of the crew</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">See where everyone is. Anyone with location off shows as last seen, never guessed.</p>
            <div className="mt-5 flex items-center gap-2">
              {["A", "M", "S"].map((l, i) => (
                <span key={l} className={"relative grid size-9 place-items-center text-xs font-semibold " + (i < 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {l}
                  {i < 2 && <span className="absolute -top-1 -right-1 size-2.5 animate-pulse bg-emerald-500" />}
                </span>
              ))}
              <span className="ml-1 text-xs text-muted-foreground">2 live, 1 last seen 12 min ago</span>
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-6 md:col-span-2">
            <span className="grid size-11 place-items-center bg-primary/20 text-brand">
              <Clapperboard className="size-5" />
            </span>
            <h3 className="mt-5 text-xl font-semibold">A story of the trip</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A narrated 3D fly-through of the final plan, made once by an admin and shareable on its own link.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 bg-primary px-3 py-2 text-xs font-medium tracking-wider text-primary-foreground uppercase">
              <Sparkles className="size-3.5" />
              Watch the story
            </span>
          </SpotlightCard>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24">
        <Reveal>
          <div className="relative overflow-hidden border bg-card p-10 text-center sm:p-16">
            <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_90%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_65%),transparent)]" />
            <MessagesSquare aria-hidden className="mx-auto mb-5 size-8 text-brand" />
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Your next trip starts with one link.</h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">Create a trip, send the invite, and let everyone shape the plan together.</p>
            <Button asChild size="lg" className="mt-9 h-12 gap-2 px-7">
              <Link href={primaryHref}>
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <p className="flex items-center gap-2 text-xs tracking-wider uppercase">
            <Compass className="size-3.5 text-brand" />
            Built for the SerpApi Hackathon · Travel &amp; Local Discovery
          </p>
        </div>
      </footer>
    </div>
  )
}
