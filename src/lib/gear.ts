/**
 * Gear & shopping — shared types and the deterministic idea generator.
 * Plain module (no "use server"/"use client") so the server actions, the page
 * and the client UI can all import it.
 */

export type GearIdea = {
  /** The Amazon search to run when the idea is clicked. */
  query: string
  /** Short chip title, e.g. "Thermal wear". */
  label: string
  /** Why it suits THIS trip — shown under the label. */
  reason: string
}

/** A product the crew has put on the shared list. */
export type PickData = {
  id: string
  asin: string
  title: string
  link: string
  image: string | null
  price: string | null
  priceValue: number | null
  rating: number | null
  reviews: number | null
  note: string | null
  createdAt: string
  suggestedBy: { id: string; name: string; image: string | null }
  /** Everyone who has said "I need this" (the suggester counts). */
  voterIds: string[]
}

export type GearContext = {
  destination: string
  tripType: string
  interests: string[]
  /** 0 = January … 11 = December */
  month: number
  days: number
}

const COLD_PLACES =
  /manali|shimla|leh|ladakh|himachal|spiti|kashmir|srinagar|darjeeling|gangtok|sikkim|auli|kedarnath|mussoorie|nainital|munnar|ooty|kodaikanal|switzerland|alps|iceland|norway|nepal|tibet/i

/**
 * A sensible idea list from the trip's own facts. It's the fallback when no AI
 * key is configured, and it doubles as a quality floor for the AI's output.
 */
export function fallbackGearIdeas(ctx: GearContext): GearIdea[] {
  const ideas: GearIdea[] = []
  const has = (name: string) => ctx.interests.some((i) => i.toLowerCase() === name.toLowerCase())
  const place = ctx.destination.split(",")[0].trim()
  const wintry = [10, 11, 0, 1].includes(ctx.month)
  const monsoon = [5, 6, 7, 8].includes(ctx.month)

  if (COLD_PLACES.test(ctx.destination) && (wintry || ctx.month === 2 || ctx.month === 9)) {
    ideas.push(
      {
        query: "thermal innerwear set",
        label: "Thermal wear",
        reason: `${place} gets properly cold this time of year — a base layer changes everything.`,
      },
      {
        query: "woollen gloves cap neck warmer set",
        label: "Gloves & cap",
        reason: "Small, light and the first thing people wish they had on a cold morning.",
      }
    )
  }
  if (monsoon) {
    ideas.push({
      query: "waterproof backpack rain cover",
      label: "Rain protection",
      reason: `It's monsoon season around ${place} — keep bags and phones dry.`,
    })
  }
  if (has("Trekking") || ctx.tripType === "ADVENTURE") {
    ideas.push(
      {
        query: "trekking shoes",
        label: "Trekking shoes",
        reason: "Your crew picked trekking — grip and ankle support matter on trails.",
      },
      {
        query: "headlamp rechargeable",
        label: "Headlamp",
        reason: "Hands-free light for early starts and late returns.",
      }
    )
  }
  if (has("Beaches")) {
    ideas.push(
      {
        query: "quick dry microfibre towel",
        label: "Quick-dry towel",
        reason: "Beach days without a soggy towel in your bag.",
      },
      {
        query: "waterproof phone pouch",
        label: "Waterproof pouch",
        reason: "For photos near the water without the worry.",
      }
    )
  }
  if (has("Temples") || ctx.tripType === "PILGRIMAGE") {
    ideas.push({
      query: "slip on comfortable sandals",
      label: "Slip-on footwear",
      reason: "Shoes come off at every temple — easy on, easy off.",
    })
  }
  if (has("Nightlife") || has("Pubs") || has("Parties")) {
    ideas.push({
      query: "anti theft crossbody bag",
      label: "Anti-theft bag",
      reason: "Keep phone and wallet close on crowded nights out.",
    })
  }
  if (has("Shopping")) {
    ideas.push({
      query: "foldable duffel bag",
      label: "Foldable duffel",
      reason: "Room for everything you'll bring back.",
    })
  }
  if (ctx.tripType === "WORKATION") {
    ideas.push({
      query: "portable laptop stand",
      label: "Laptop stand",
      reason: "A proper desk setup anywhere you open the laptop.",
    })
  }

  // The basics every group trip needs
  ideas.push(
    {
      query: "power bank 20000mah",
      label: "Power bank",
      reason: "Maps, photos and tickets all drain the phone — one bank can cover the crew.",
    },
    {
      query: "universal travel adapter",
      label: "Travel adapter",
      reason: "One adapter that works across plugs, easy to share.",
    },
    {
      query: "packing cubes organiser",
      label: "Packing cubes",
      reason: `Keeps a ${ctx.days}-day bag tidy and quick to repack.`,
    },
    {
      query: "compact first aid kit travel",
      label: "First-aid kit",
      reason: "Plasters, antiseptic and basics, already sorted.",
    }
  )

  // De-duplicate by query, keep order, cap the list.
  const seen = new Set<string>()
  return ideas
    .filter((i) => (seen.has(i.query) ? false : (seen.add(i.query), true)))
    .slice(0, 8)
}

/** Maps a product row (with its suggester and votes) to the shape the UI uses. */
export function toPick(row: {
  id: string
  asin: string
  title: string
  link: string
  image: string | null
  price: string | null
  priceValue: number | null
  rating: number | null
  reviews: number | null
  note: string | null
  createdAt: Date
  suggestedBy: { id: string; name: string | null; email: string | null; image: string | null }
  votes: { userId: string }[]
}): PickData {
  return {
    id: row.id,
    asin: row.asin,
    title: row.title,
    link: row.link,
    image: row.image,
    price: row.price,
    priceValue: row.priceValue,
    rating: row.rating,
    reviews: row.reviews,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    suggestedBy: {
      id: row.suggestedBy.id,
      name: row.suggestedBy.name ?? row.suggestedBy.email?.split("@")[0] ?? "Crew member",
      image: row.suggestedBy.image,
    },
    voterIds: row.votes.map((v) => v.userId),
  }
}
