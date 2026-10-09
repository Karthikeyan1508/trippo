"use client"

import Link from "next/link"
import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Recoverable error screen. Next.js 16 passes `retry` (re-fetches the segment). */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That didn&apos;t load. It&apos;s usually temporary — try again, or head back to
          your trips.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => retry()}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">My trips</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
