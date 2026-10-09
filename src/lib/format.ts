import { format } from "date-fns"

export function formatDateRange(start: Date, end: Date) {
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()
  if (sameMonth) return `${format(start, "d")}-${format(end, "d MMM yyyy")}`
  if (sameYear) return `${format(start, "d MMM")} - ${format(end, "d MMM yyyy")}`
  return `${format(start, "d MMM yyyy")} - ${format(end, "d MMM yyyy")}`
}

export function tripDurationDays(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

const CURRENCY_LOCALES: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  AED: "en-AE",
  SGD: "en-SG",
}

export function formatMoney(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALES[currency] ?? "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

/** "NON_VEG" -> "Non veg", "WORKATION" -> "Workation" */
export function prettifyEnum(value: string) {
  const lower = value.replace(/_/g, " ").toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
