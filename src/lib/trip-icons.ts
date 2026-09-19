import { prettifyEnum } from "@/lib/format"

/**
 * Context-aware icon KEY for an itinerary item — meal type for food and
 * transport mode for travel. Maps to a Lucide icon in activity-icon.tsx.
 * Data-only so it is safe on the server (story builder) and client.
 */
export function activityIconKey(
  category: string,
  title: string,
  description?: string | null
): string {
  const t = `${title} ${description ?? ""}`.toLowerCase()

  if (category === "FOOD") {
    if (/\bbreakfast|brunch\b/.test(t)) return "breakfast"
    if (/\blunch\b/.test(t)) return "lunch"
    if (/\bdinner|supper\b/.test(t)) return "dinner"
    if (/\bbar\b|drinks|pub|beer|cocktail|nightlife|nightcap|wine/.test(t))
      return "drinks"
    if (/snack|cafe|café|coffee|tea|bakery|dessert|ice cream/.test(t))
      return "snack"
    return "food"
  }

  if (category === "TRAVEL") {
    if (/flight|fly|plane|airport|air /.test(t)) return "flight"
    if (/train|rail/.test(t)) return "train"
    if (/\bbus\b|coach/.test(t)) return "bus"
    if (/ferry|boat|ship|cruise|kayak|sail/.test(t)) return "ferry"
    if (/bike|scooter|motorcycle|cycle|moped/.test(t)) return "bike"
    if (/\bwalk|stroll|on foot/.test(t)) return "walk"
    if (/cab|taxi|\bcar\b|drive|driving|road trip|self-drive/.test(t))
      return "drive"
    return "travel"
  }

  if (category === "STAY") return "stay"
  if (category === "SHOPPING") return "shopping"
  if (category === "EVENT") return "event"

  if (category === "ACTIVITY") {
    if (/beach|shore|sunset|coast/.test(t)) return "beach"
    if (/fort|palace|heritage|temple|church|museum|monument|ruin/.test(t))
      return "heritage"
    if (/trek|hike|waterfall|trail|cave|hill|mountain|nature/.test(t))
      return "trek"
    if (/spa|massage|relax|wellness/.test(t)) return "spa"
    if (/party|club|nightlife/.test(t)) return "event"
    return "activity"
  }

  return "default"
}

/** Short, specific label for the item's meta line. */
export function activityLabel(
  category: string,
  title: string,
  description?: string | null
): string {
  const t = `${title} ${description ?? ""}`.toLowerCase()

  if (category === "FOOD") {
    if (/\bbreakfast|brunch\b/.test(t)) return "Breakfast"
    if (/\blunch\b/.test(t)) return "Lunch"
    if (/\bdinner|supper\b/.test(t)) return "Dinner"
    if (/\bbar\b|drinks|pub|cocktail|nightcap/.test(t)) return "Drinks"
    if (/snack|cafe|café|coffee|tea|bakery|dessert/.test(t)) return "Snack"
    return "Food"
  }

  if (category === "TRAVEL") {
    if (/flight|fly|plane|airport/.test(t)) return "Flight"
    if (/train|rail/.test(t)) return "Train"
    if (/\bbus\b|coach/.test(t)) return "Bus"
    if (/ferry|boat|ship|cruise/.test(t)) return "Ferry"
    if (/bike|scooter|motorcycle|cycle/.test(t)) return "Ride"
    if (/\bwalk|stroll|on foot/.test(t)) return "Walk"
    if (/cab|taxi|\bcar\b|drive/.test(t)) return "Drive"
    return "Travel"
  }

  return prettifyEnum(category)
}

/** Tailwind classes for the coloured icon chip, by category. */
export function categoryColor(category: string): string {
  switch (category) {
    case "TRAVEL":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400"
    case "STAY":
      return "bg-violet-500/10 text-violet-600 dark:text-violet-400"
    case "FOOD":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400"
    case "ACTIVITY":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    case "SHOPPING":
      return "bg-pink-500/10 text-pink-600 dark:text-pink-400"
    case "EVENT":
      return "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400"
    default:
      return "bg-muted text-muted-foreground"
  }
}
