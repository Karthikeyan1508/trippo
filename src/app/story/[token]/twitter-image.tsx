import { storyCard } from "@/lib/og-cards"

export const alt = "A Trippo trip story"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return storyCard(token)
}
