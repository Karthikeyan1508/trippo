/**
 * Which Amazon storefront to search for a trip. Prices come back in that
 * store's currency, so mapping from the trip's currency keeps every number the
 * crew sees in the same units as the trip budget.
 */
const DOMAIN_BY_CURRENCY: Record<string, string> = {
  INR: "amazon.in",
  USD: "amazon.com",
  GBP: "amazon.co.uk",
  EUR: "amazon.de",
  AED: "amazon.ae",
  SGD: "amazon.sg",
}

export function amazonDomainFor(currency: string) {
  return DOMAIN_BY_CURRENCY[currency] ?? "amazon.com"
}

export const AMAZON_DOMAINS = Object.values(DOMAIN_BY_CURRENCY)

/** Amazon product ids are exactly ten uppercase letters/digits. */
export function isAsin(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9]{10}$/.test(value)
}

/**
 * Canonical product link rebuilt from the id alone. We never store a URL
 * supplied by a browser: a crew member (or a tampered request) could otherwise
 * plant an arbitrary link in front of everyone else.
 */
export function productUrl(domain: string, asin: string) {
  return `https://www.${domain}/dp/${asin}`
}

/** Product photos only ever come from Amazon's image CDN. */
export function isAmazonImage(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      (url.hostname.endsWith(".media-amazon.com") ||
        url.hostname.endsWith(".ssl-images-amazon.com"))
    )
  } catch {
    return false
  }
}

export const SORT_OPTIONS = [
  { value: "relevance", label: "Best match", param: undefined },
  { value: "price-asc", label: "Price: low to high", param: "price-asc-rank" },
  { value: "price-desc", label: "Price: high to low", param: "price-desc-rank" },
  { value: "rating", label: "Top rated", param: "review-rank" },
] as const

export type SortValue = (typeof SORT_OPTIONS)[number]["value"]
