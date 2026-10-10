import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"

import { prisma } from "@/lib/prisma"
import { formatDateRange, tripDurationDays } from "@/lib/format"

/**
 * Share-preview cards (Open Graph / Twitter), drawn on demand with Satori.
 * Everything here is plain inline-styled JSX, Satori supports a CSS subset,
 * and every element with more than one child must be `display: flex`.
 */

export const OG_SIZE = { width: 1200, height: 630 }

/**
 * The app's own typeface (Space Grotesk), shipped as TTF because Satori cannot read the
 * woff2 files next/font produces. Without it the cards fall back to a generic sans.
 */
const FONT_FAMILY = "Space Grotesk"
let fontCache: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null
function fonts() {
  fontCache ??= Promise.all(
    ([["SpaceGrotesk-Regular.ttf", 400], ["SpaceGrotesk-Bold.ttf", 700]] as const).map(async ([file, weight]) => ({
      name: FONT_FAMILY,
      data: await readFile(path.join(process.cwd(), "src/assets/fonts", file)),
      weight,
      style: "normal" as const,
    }))
  ).catch((error) => {
    console.error("OG fonts failed to load:", error)
    fontCache = null
    return []
  })
  return fontCache
}
async function ogOptions() {
  return { ...OG_SIZE, fonts: await fonts() }
}

const LIME = "#8be000"
const INK = "#10170a"

function Compass({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill={color} />
    </svg>
  )
}

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 56,
          height: 56,
          background: LIME,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Compass size={34} color="#1d2e00" />
      </div>
      <div style={{ fontSize: 38, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>Trippo</div>
    </div>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 64,
        gap: 56,
        color: "#fff",
        fontFamily: FONT_FAMILY,
        background: INK,
        backgroundImage:
          "radial-gradient(circle at 100% 100%, rgba(139,224,0,0.42), rgba(139,224,0,0) 55%), radial-gradient(circle at 0% 0%, rgba(139,224,0,0.14), rgba(139,224,0,0) 45%)",
      }}
    >
      {children}
    </div>
  )
}

/** Fetches the trip photo ourselves so a slow or broken host can't sink the whole image. */
async function loadPhoto(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return null
    const res = await fetch(parsed, { signal: AbortSignal.timeout(3500) })
    const type = res.headers.get("content-type")?.split(";")[0] ?? ""
    // Satori decodes PNG and JPEG (not WebP/AVIF).
    if (!res.ok || !["image/jpeg", "image/png"].includes(type)) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > 3_000_000) return null
    return `data:${type};base64,${bytes.toString("base64")}`
  } catch {
    return null
  }
}

/** The generic Trippo card, used for the site itself and as the fallback for bad links. */
export async function brandCard() {
  const points = ["AI plans from real data", "A live map of the crew", "Budgets that settle up"]
  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <Brand />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                letterSpacing: 5,
                color: LIME,
                textTransform: "uppercase",
              }}
            >
              Group trip planner
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                marginTop: 18,
                fontSize: 110,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -2,
              }}
            >
              <span>Less group chat.&nbsp;</span>
              <span style={{ color: LIME }}>More trip.</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {points.map((p) => (
              <div
                key={p}
                style={{
                  display: "flex",
                  padding: "12px 20px",
                  fontSize: 24,
                  color: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  background: "rgba(255,255,255,0.07)",
                }}
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      </Frame>
    ),
    await ogOptions()
  )
}

/** "You're invited" card for /join/[code], built from the trip itself. */
export async function inviteCard(code: string) {
  const trip = await prisma.trip.findUnique({
    where: { joinCode: code },
    select: {
      name: true,
      destination: true,
      startDate: true,
      endDate: true,
      status: true,
      coverImage: true,
      members: {
        orderBy: { joinedAt: "asc" },
        select: { role: true, user: { select: { name: true } } },
      },
    },
  })
  if (!trip || trip.status === "ARCHIVED") return brandCard()

  const inviterName = (trip.members.find((m) => m.role === "ADMIN") ?? trip.members[0])?.user.name
  const inviter = inviterName?.split(" ")[0] ?? "A friend"
  const crew = trip.members.length
  const photo = await loadPhoto(trip.coverImage)
  const title = trip.name.length > 44 ? `${trip.name.slice(0, 43)}…` : trip.name
  const titleSize = title.length > 30 ? 60 : title.length > 18 ? 72 : 88
  const days = tripDurationDays(trip.startDate, trip.endDate)

  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <Brand />

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                letterSpacing: 5,
                color: LIME,
                textTransform: "uppercase",
              }}
            >
              {inviter} invited you to
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 16,
                fontSize: titleSize,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -2,
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 22,
                fontSize: 30,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              {trip.destination}
            </div>
            <div style={{ display: "flex", marginTop: 6, fontSize: 28, color: "rgba(255,255,255,0.55)" }}>
              {formatDateRange(trip.startDate, trip.endDate)} · {days} {days === 1 ? "day" : "days"}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div
              style={{
                display: "flex",
                padding: "16px 30px",
                fontSize: 28,
                fontWeight: 700,
                color: "#1d2e00",
                background: LIME,
              }}
            >
              Join the trip
            </div>
            <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.65)" }}>
              {crew} {crew === 1 ? "traveller" : "travellers"} going
            </div>
          </div>
        </div>

        {/* Destination photo, or the brand mark when there isn't one. */}
        <div
          style={{
            display: "flex",
            width: 380,
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(255,255,255,0.25)",
            background: photo ? "#000" : LIME,
          }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" width={378} height={502} style={{ objectFit: "cover" }} />
          ) : (
            <Compass size={190} color="#1d2e00" />
          )}
        </div>
      </Frame>
    ),
    await ogOptions()
  )
}

/**
 * Share card for a public trip story (/story/[token]): the story's own photo full bleed under a
 * dark wash, in the same type and lime as the other cards. Only what the story page itself shows.
 */
export async function storyCard(token: string) {
  const row = /^[\w-]{16,64}$/.test(token)
    ? await prisma.tripStory.findUnique({
        where: { shareToken: token },
        select: { data: true, trip: { select: { coverImage: true } } },
      })
    : null
  if (!row) return brandCard()

  const story = row.data as unknown as {
    tripName: string
    destination: string
    scenes: { photoUrl: string | null; images: string[] }[]
  }
  const candidates = [
    ...story.scenes.flatMap((s) => [s.photoUrl, ...s.images]),
    row.trip.coverImage,
  ].filter((u, i, all): u is string => Boolean(u) && all.indexOf(u) === i)
  let photo: string | null = null
  for (const url of candidates.slice(0, 4)) {
    photo = await loadPhoto(url)
    if (photo) break
  }

  const title = story.tripName.length > 44 ? `${story.tripName.slice(0, 43)}…` : story.tripName
  const titleSize = title.length > 30 ? 64 : title.length > 18 ? 80 : 98
  const stops = story.scenes.length

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          color: "#fff",
          fontFamily: FONT_FAMILY,
          background: INK,
          backgroundImage:
            "radial-gradient(circle at 100% 100%, rgba(139,224,0,0.42), rgba(139,224,0,0) 55%), radial-gradient(circle at 0% 0%, rgba(139,224,0,0.14), rgba(139,224,0,0) 45%)",
        }}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} />
        )}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundImage: photo
              ? "linear-gradient(to top, rgba(16,23,10,0.96), rgba(16,23,10,0.55) 55%, rgba(16,23,10,0.35))"
              : "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 64,
          }}
        >
          <Brand />

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, letterSpacing: 5, color: LIME, textTransform: "uppercase" }}>
              A trip story
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 16,
                fontSize: titleSize,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -2,
              }}
            >
              {title}
            </div>
            <div style={{ display: "flex", marginTop: 22, fontSize: 32, color: "rgba(255,255,255,0.85)" }}>
              {story.destination}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 30px",
                fontSize: 28,
                fontWeight: 700,
                color: "#1d2e00",
                background: LIME,
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="#1d2e00">
                <polygon points="7 4 20 12 7 20 7 4" />
              </svg>
              Watch the story
            </div>
            <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.75)" }}>
              {stops} {stops === 1 ? "stop" : "stops"}, mapped one by one
            </div>
          </div>
        </div>
      </div>
    ),
    await ogOptions()
  )
}
