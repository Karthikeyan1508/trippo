import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { prisma } from "@/lib/prisma"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { TripStory } from "@/app/(app)/trips/[id]/trip-story"
import type { StoryData } from "@/server/story"

/**
 * A trip's story, open to anyone holding its link. This route reads only the saved story
 * (scenes, narration, photos): no crew, budget, chat or plan, and nothing needs a sign-in.
 * An admin can switch the link off, after which this page is a 404.
 */
async function loadShared(token: string): Promise<StoryData | null> {
  if (!/^[\w-]{16,64}$/.test(token)) return null
  const row = await prisma.tripStory.findUnique({ where: { shareToken: token }, select: { data: true } })
  return (row?.data as unknown as StoryData | undefined) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const story = await loadShared(token)
  if (!story) return { title: "Story not found | Trippo", robots: { index: false, follow: false } }
  return {
    title: `${story.tripName}, a trip story | Trippo`,
    description: `${story.scenes.length} stops in ${story.destination}, mapped stop to stop.`,
    robots: { index: false, follow: false },
    openGraph: { type: "website", title: `${story.tripName}, a trip story`, description: `${story.scenes.length} stops in ${story.destination}, mapped stop to stop.` },
  }
}

export default async function SharedStoryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const story = await loadShared(token)
  if (!story) notFound()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/60 px-4 backdrop-blur-xl">
        <Logo href="/" />
        <div className="flex min-w-0 items-center gap-3">
          <p className="hidden truncate text-sm text-muted-foreground sm:block">{story.tripName}</p>
          <Button asChild size="sm">
            <Link href="/login">Plan your own trip</Link>
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <TripStory tripId="" initial={story} isAdmin={false} shareToken={null} publicMode />
      </main>
    </div>
  )
}
