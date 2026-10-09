/**
 * Resolves a CSS custom property (e.g. "--primary", which the preset defines
 * in `oklch(...)`) to a `#rrggbb` string. MapLibre and canvas drawing code
 * can't read CSS variables, and older map styles don't understand oklch.
 */
export function cssVarToHex(name: string, fallback = "#84cc16"): string {
  if (typeof document === "undefined") return fallback
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  if (!raw) return fallback

  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return fallback

  ctx.fillStyle = "#000000"
  ctx.fillStyle = raw // an unparseable value leaves the previous fill in place
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
}
