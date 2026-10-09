import Link from "next/link"
import { redirect } from "next/navigation"
import { Compass, ShieldCheck } from "lucide-react"

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

  return (
    <div className="grid min-h-svh lg:h-svh lg:grid-cols-[1.1fr_1fr] lg:overflow-hidden">
      {/* Brand: the name and one line, nothing else. */}
      <div className="relative hidden h-svh flex-col justify-between overflow-hidden bg-[oklch(0.19_0.03_135)] p-12 text-white lg:flex xl:p-16">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 100% 100%, oklch(0.86 0.25 130 / 0.5), transparent 70%), radial-gradient(40% 35% at 0% 0%, oklch(0.86 0.25 130 / 0.16), transparent 70%), repeating-radial-gradient(circle at 100% 100%, transparent 0 26px, oklch(1 0 0 / 0.045) 26px 27px)",
          }}
        />

        <Link href="/" className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center bg-primary text-primary-foreground">
            <Compass className="size-6" />
          </span>
          <span className="text-2xl font-semibold tracking-tight">Trippo</span>
        </Link>

        <h2 className="relative text-6xl leading-[1.02] font-bold tracking-tight xl:text-7xl 2xl:text-8xl">
          Less group chat.
          <br />
          <span className="text-primary">More trip.</span>
        </h2>

        <span aria-hidden />
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
                  Skips Google. Signs you in with any email while developing.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
