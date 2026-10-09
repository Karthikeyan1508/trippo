import Link from "next/link"
import { LinkIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function TripNotFound() {
  return (
    <div className="grid min-h-svh place-items-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
          <LinkIcon className="size-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          We can&apos;t find that trip
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted, or you haven&apos;t joined it yet. If a friend
          sent you an invite link, open that link to join — it won&apos;t work from
          this page.
        </p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Back to my trips</Link>
        </Button>
      </div>
    </div>
  )
}
