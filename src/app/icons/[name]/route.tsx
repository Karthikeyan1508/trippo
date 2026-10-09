import { ImageResponse } from "next/og"

/**
 * App icons, drawn on demand from the brand mark (a compass on lime), so there
 * are no binary assets to keep in sync:
 *   /icons/192.png  /icons/512.png          – standard "any" icons
 *   /icons/maskable-512.png                 – extra padding for adaptive icon masks
 *   /icons/apple-180.png                    – iOS home-screen icon
 *   /icons/badge-96.png                     – monochrome glyph for the notification tray
 */

const LIME = "#8be000"
const INK = "#1d2e00"

type Spec = { size: number; glyph: number; mono?: boolean }

const SPECS: Record<string, Spec> = {
  "192.png": { size: 192, glyph: 0.62 },
  "512.png": { size: 512, glyph: 0.62 },
  // Maskable icons must keep the artwork inside the central ~60% "safe zone".
  "maskable-512.png": { size: 512, glyph: 0.46 },
  "apple-180.png": { size: 180, glyph: 0.6 },
  "badge-96.png": { size: 96, glyph: 0.8, mono: true },
}

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  const spec = SPECS[name]
  if (!spec) return new Response("Not found", { status: 404 })

  const image = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: spec.mono ? "transparent" : LIME,
      }}
    >
      <Compass size={Math.round(spec.size * spec.glyph)} color={spec.mono ? "#ffffff" : INK} />
    </div>
  )

  return new ImageResponse(image, {
    width: spec.size,
    height: spec.size,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  })
}
