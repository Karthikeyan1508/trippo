export type NameLike = { name?: string | null; email?: string | null }

/** "Priya Sharma" -> "PS"; falls back to the email, then "?". */
export function initialsOf(user: NameLike) {
  const source = user.name || user.email || "?"
  return source
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}
