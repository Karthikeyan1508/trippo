/**
 * The house voice, whatever a model or a web page sends: no emoji, no dash characters,
 * tidy whitespace, bounded length.
 */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/[\u2010-\u2013]/g, "-")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
}

export function cleanList(value: unknown, count: number, max: number): string[] {
  return Array.isArray(value) ? value.map((v) => cleanText(v, max)).filter(Boolean).slice(0, count) : []
}
