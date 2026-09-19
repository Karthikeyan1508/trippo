import Link from "next/link"
import { redirect } from "next/navigation"
import { Compass, ShieldCheck, Sparkles, MapPin, Wallet } from "lucide-react"

import { auth } from "@/auth"
import { signInWithGoogle, devSignIn } from "@/server/auth-actions"
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

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect("/dashboard")

  const isDev = process.env.NODE_ENV !== "production"

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Brand / about the product */}
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary-foreground text-primary">
            <Compass className="size-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Trippo</span>
        </Link>

        <div className="max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Group trips, minus the group chat chaos.
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/70">
            One place for preferences, AI itineraries, live location and shared
            budgets — so the whole crew stays on the same page.
          </p>

          <ul className="mt-8 space-y-3 text-primary-foreground/80">
            <li className="flex items-center gap-3">
              <Sparkles className="size-5 shrink-0" />
              AI plans built from real flights, stays &amp; places
            </li>
            <li className="flex items-center gap-3">
              <MapPin className="size-5 shrink-0" />
              A live map of everyone on the trip
            </li>
            <li className="flex items-center gap-3">
              <Wallet className="size-5 shrink-0" />
              Split expenses and settle up automatically
            </li>
          </ul>
        </div>

        <p className="text-sm text-primary-foreground/60">
          Built for the SerpApi Hackathon · Travel &amp; Local Discovery
        </p>
      </div>

      {/* Sign-in */}
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between lg:hidden">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Compass className="size-5" />
            </span>
            <span className="text-xl font-semibold tracking-tight">Trippo</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                Welcome back
              </h1>
              <p className="text-lg text-muted-foreground">
                Sign in to plan your next group trip.
              </p>
            </div>

            <form action={signInWithGoogle} className="mt-8">
              <Button
                type="submit"
                variant="outline"
                size="lg"
                className="h-12 w-full gap-3 text-base"
              >
                <GoogleIcon className="size-5" />
                Continue with Google
              </Button>
            </form>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground">
              <ShieldCheck className="size-4" />
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
