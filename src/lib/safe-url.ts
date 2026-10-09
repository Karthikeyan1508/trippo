/**
 * Links in search results come from third parties. Only ever render http(s)
 * URLs into an `href`, never `javascript:` or `data:` schemes.
 */
export function safeHttpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** Keep only characters valid in a phone number for a `tel:` link. */
export function telHref(phone: string | null | undefined): string | undefined {
  const digits = phone?.replace(/[^\d+]/g, "")
  return digits && digits.length >= 5 ? `tel:${digits}` : undefined
}
