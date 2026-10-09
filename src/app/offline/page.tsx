import Link from "next/link"
import { CloudOff, Compass } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 px-5">
      <section className="max-w-md rounded-2xl border bg-card p-7 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/10 text-brand"><CloudOff className="size-6" /></div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Your last-opened trip pages remain available. Reconnect when you&apos;re ready to sync locations, approvals, and expenses.</p>
        <Button asChild className="mt-6 gap-2"><Link href="/dashboard"><Compass className="size-4" />Try again</Link></Button>
      </section>
    </main>
  )
}
