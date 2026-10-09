/**
 * Turns a user-supplied `callbackUrl` into a safe same-site path.
 *
 * Auth.js hands back the full original URL; we only ever keep its path and
 * query, which also rules out open redirects (`//evil.com`, `/\evil.com`,
 * `https://evil.com`).
 */
export function safeRedirectPath(input: unknown, fallback = "/dashboard") {
  if (typeof input !== "string" || !input) return fallback

  let path = input
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input)
      path = url.pathname + url.search
    } catch {
      return fallback
    }
  }

  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return fallback
  }
  return path
}
