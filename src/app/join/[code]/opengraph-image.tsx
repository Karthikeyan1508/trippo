import { inviteCard } from "@/lib/og-cards"

export const alt = "You're invited to a Trippo trip"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return inviteCard(code)
}
