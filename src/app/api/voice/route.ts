import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Narration costs real money per character — cap how fast one person can spend it.
  const limited = rateLimit(`voice:${session.user.id}`, 60, 60 * 60 * 1000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many narration requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    )
  }

  const body = await request.json().catch(() => null) as { text?: unknown; tripId?: unknown } | null
  const text = typeof body?.text === "string" ? body.text.trim() : ""
  const tripId = typeof body?.tripId === "string" ? body.tripId : ""
  if (!text || text.length > 1_800 || !tripId) return NextResponse.json({ error: "Invalid narration request" }, { status: 400 })

  const membership = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId: session.user.id } } })
  if (!membership) return NextResponse.json({ error: "Not a trip member" }, { status: 403 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!apiKey || !voiceId) {
    return NextResponse.json({ error: "Premium voice is not configured" }, { status: 503 })
  }

  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.48, similarity_boost: 0.7 } }),
  })
  if (!upstream.ok) return NextResponse.json({ error: "Voice generation failed" }, { status: 502 })

  return new Response(upstream.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } })
}
