import Link from "next/link"
import { redirect } from "next/navigation"
import { CheckCircle2, Compass, MapPin, ShieldCheck, Sparkles, Wallet } from "lucide-react"

import { auth } from "@/auth"
import { signInWithGoogle, devSignIn } from "@/server/auth-actions"
import { safeRedirectPath } from "@/lib/redirect"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { callbackUrl } = await searchParams
  const next = safeRedirectPath(callbackUrl)
  const session = await auth()
  if (session?.user) redirect(next)

  const isDev = process.env.NODE_ENV !== "production"
  const invited = next.startsWith("/join/")

  const features = [
    {
      icon: Sparkles,
      title: "AI plans from real data",
      text: "Flights, stays and places pulled live, shaped around everyone's preferences.",
    },
    {
      icon: MapPin,
      title: "A live map of the crew",
      text: "See where everyone is on the day, and never lose someone at the market.",
    },
    {
      icon: Wallet,
      title: "Budgets that settle up",
      text: "Log expenses as you go; Trippo works out who owes whom.",
    },
  ]

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand / about the product */}
      <div className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-[oklch(0.19_0.03_135)] p-12 text-white lg:flex xl:p-16">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 100% 100%, oklch(0.86 0.25 130 / 0.45), transparent 70%), radial-gradient(40% 35% at 0% 0%, oklch(0.86 0.25 130 / 0.16), transparent 70%), repeating-radial-gradient(circle at 100% 100%, transparent 0 26px, oklch(1 0 0 / 0.045) 26px 27px)",
          }}
        />

        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center bg-primary text-primary-foreground">
            <Compass className="size-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Trippo</span>
        </Link>

        <div className="relative max-w-lg">
          <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
            Group trip planner
          </p>
          <h2 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight xl:text-5xl">
            Group trips, minus the group chat{" "}
            <span className="text-primary">chaos.</span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            One place for preferences, itineraries, live location and shared
            budgets, so the whole crew stays on the same page.
          </p>

          <ul className="mt-10 space-y-3">
            {features.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex items-start gap-4 border border-white/10 bg-white/[0.06] p-4 backdrop-blur-md"
              >
                <span className="grid size-10 shrink-0 place-items-center bg-primary/15 text-primary">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/60">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-end justify-between gap-6 [@media(max-height:819px)]:justify-end">
          <div className="hidden w-64 border border-white/10 bg-white/[0.07] p-4 backdrop-blur-xl [@media(min-height:820px)]:block">
            <p className="text-[11px] tracking-widest text-white/50 uppercase">Now planning</p>
            <p className="mt-1 font-semibold">Coorg Escape</p>
            <p className="text-sm text-white/60">Dec 20 – 23 · 5 travellers</p>
            <div className="mt-3 flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="size-4" />
              Plan approved by 4 of 5
            </div>
          </div>
          <p className="max-w-[12rem] text-right text-xs leading-relaxed text-white/45">
            Built for the SerpApi Hackathon · Travel &amp; Local Discovery
          </p>
        </div>
      </div>

      {/* Sign-in */}
      <div className="relative flex flex-col p-6 md:p-12">
        <div className="lg:hidden">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center bg-primary text-primary-foreground">
              <Compass className="size-5" />
            </span>
            <span className="text-xl font-semibold tracking-tight">Trippo</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md border border-foreground/15 bg-card/70 p-8 shadow-xl backdrop-blur-xl md:p-10">
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-[0.2em] text-brand uppercase">
                {invited ? "Crew invite" : "Sign in"}
              </p>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                {invited ? "You're invited" : "Welcome back"}
              </h1>
              <p className="text-base text-muted-foreground">
                {invited
                  ? "Sign in to join the trip your friends are planning."
                  : "Sign in to plan your next group trip."}
              </p>
            </div>

            <form action={signInWithGoogle} className="mt-8">
              <input type="hidden" name="callbackUrl" value={next} />
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full gap-3 border border-border bg-white text-base text-neutral-900 shadow-sm hover:bg-neutral-50"
              >
                <GoogleIcon className="size-5" />
                Continue with Google
              </Button>
            </form>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" />
              We only use your Google account to identify you.
            </p>

            {isDev && (
              <>
                <div className="my-8 flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Local dev only
                  </span>
                  <Separator className="flex-1" />
                </div>

                <form action={devSignIn} className="space-y-3">
                  <input type="hidden" name="callbackUrl" value={next} />
                  <Input
                    name="email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="h-12 text-base"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    variant="secondary"
                    className="h-12 w-full text-base"
                  >
                    Dev sign in
                  </Button>
                </form>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Skips Google — signs you in with any email while developing.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
