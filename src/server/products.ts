"use server"

import { revalidatePath } from "next/cache"
import { addDays } from "date-fns"

import { prisma } from "@/lib/prisma"
import { membershipFor } from "@/lib/access"
import { rateLimit } from "@/lib/rate-limit"
import { notify, personName } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"
import {
  SORT_OPTIONS,
  amazonDomainFor,
  isAmazonImage,
  isAsin,
  productUrl,
  type SortValue,
} from "@/lib/amazon"
import { fallbackGearIdeas, toPick, type GearIdea, type PickData } from "@/lib/gear"
import { fetchAmazonProducts, type ProductLite } from "@/server/serpapi"
import { suggestGearWithGroq } from "@/server/groq"

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

const NOT_A_MEMBER = "You're not a member of this trip."

/** Search Amazon for the trip's storefront. Any crew member can search. */
export async function searchProducts(
  tripId: string,
  rawQuery: string,
  sort: SortValue = "relevance"
): Promise<Result<{ products: ProductLite[]; domain: string }>> {
  const { user, member } = await membershipFor(tripId)
  if (!member) return { ok: false, error: NOT_A_MEMBER }

  const query = rawQuery.trim().replace(/\s+/g, " ").slice(0, 100)
  if (query.length < 2) return { ok: false, error: "Type at least two characters to search." }
  if (!process.env.SERPAPI_API_KEY) {
    return { ok: false, error: "Product search needs a SerpApi key on the server." }
  }

  // Each uncached search costs a SerpApi credit, so keep runaway use in check.
  const limited = rateLimit(`amazon:${user.id}`, 40, 60 * 60 * 1000)
  if (!limited.ok) {
    return { ok: false, error: "You've searched a lot. Try again in a few minutes." }
  }

  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { currency: true } })
  if (!trip) return { ok: false, error: "Trip not found." }
  const domain = amazonDomainFor(trip.currency)
  const sortParam = SORT_OPTIONS.find((o) => o.value === sort)?.param

  const products = await fetchAmazonProducts(tripId, query, domain, sortParam)
  return { ok: true, data: { products, domain } }
}

/**
 * Trip-specific shopping ideas: AI-written when Groq is configured, otherwise
 * derived from the trip's season, type and the crew's interests. Cached per
 * plan version, so regenerating the itinerary refreshes the ideas.
 */
export async function getGearIdeas(tripId: string): Promise<Result<GearIdea[]>> {
  const { member } = await membershipFor(tripId)
  if (!member) return { ok: false, error: NOT_A_MEMBER }

  const [trip, itinerary] = await Promise.all([
    prisma.trip.findUnique({
      where: { id: tripId },
      include: { members: { include: { preference: true } } },
    }),
    prisma.itinerary.findFirst({
      where: { tripId },
      orderBy: { generatedAt: "desc" },
      include: { days: { include: { items: { select: { title: true, category: true } } } } },
    }),
  ])
  if (!trip) return { ok: false, error: "Trip not found." }

  const queryKey = `v1:${itinerary?.id ?? "none"}`
  const cached = await prisma.researchQuery.findUnique({
    where: { tripId_engine_queryKey: { tripId, engine: "gear_ideas", queryKey } },
  })
  if (cached && cached.expiresAt > new Date()) {
    return { ok: true, data: (cached.response as { ideas: GearIdea[] }).ideas }
  }

  const prefs = trip.members.map((m) => m.preference).filter((p) => p !== null)
  const interests = [...new Set(prefs.flatMap((p) => p.interests))]
  const accessibility = prefs
    .map((p) => p.accessibility?.trim())
    .filter((a): a is string => !!a)
  const activities = (itinerary?.days ?? [])
    .flatMap((d) => d.items)
    .filter((i) => i.category === "ACTIVITY" || i.category === "EVENT")
    .map((i) => i.title)
    .slice(0, 14)

  const days = Math.max(
    1,
    Math.round((trip.endDate.getTime() - trip.startDate.getTime()) / 86_400_000) + 1
  )
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  const ideas =
    (await suggestGearWithGroq({
      destination: trip.destination,
      tripType: trip.tripType,
      startDate: iso(trip.startDate),
      endDate: iso(trip.endDate),
      days,
      interests,
      accessibility,
      activities,
    })) ??
    fallbackGearIdeas({
      destination: trip.destination,
      tripType: trip.tripType,
      interests,
      month: trip.startDate.getUTCMonth(),
      days,
    })

  await prisma.researchQuery.upsert({
    where: { tripId_engine_queryKey: { tripId, engine: "gear_ideas", queryKey } },
    create: {
      tripId,
      engine: "gear_ideas",
      queryKey,
      params: {},
      response: { ideas },
      expiresAt: addDays(new Date(), 14),
    },
    update: { response: { ideas }, fetchedAt: new Date(), expiresAt: addDays(new Date(), 14) },
  })
  return { ok: true, data: ideas }
}

export type SuggestInput = {
  asin: string
  title: string
  price?: string
  priceValue?: number
  rating?: number
  reviews?: number
  image?: string
  query?: string
}

const MAX_PRODUCTS_PER_TRIP = 100

/**
 * Put a product on the crew's shared list. Every crew member can suggest.
 * The link is rebuilt from the ASIN on the server, never taken from the request.
 */
export async function suggestProduct(
  tripId: string,
  input: SuggestInput,
  note?: string
): Promise<Result<PickData>> {
  const { user, member } = await membershipFor(tripId)
  if (!member) return { ok: false, error: NOT_A_MEMBER }
  if (!isAsin(input.asin)) return { ok: false, error: "That product can't be added." }

  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { currency: true } })
  if (!trip) return { ok: false, error: "Trip not found." }

  const existing = await prisma.productSuggestion.findUnique({
    where: { tripId_asin: { tripId, asin: input.asin } },
  })
  if (!existing) {
    const count = await prisma.productSuggestion.count({ where: { tripId } })
    if (count >= MAX_PRODUCTS_PER_TRIP) {
      return { ok: false, error: "The crew list is full. Remove something first." }
    }
  }

  const finite = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null)
  const row =
    existing ??
    (await prisma.productSuggestion.create({
      data: {
        tripId,
        suggestedById: user.id,
        asin: input.asin,
        title: String(input.title ?? "").trim().slice(0, 200) || "Product",
        link: productUrl(amazonDomainFor(trip.currency), input.asin),
        image: isAmazonImage(input.image) ? input.image : null,
        price: input.price ? String(input.price).slice(0, 32) : null,
        priceValue: finite(input.priceValue),
        rating: finite(input.rating),
        reviews: finite(input.reviews) != null ? Math.round(input.reviews as number) : null,
        note: note?.trim() ? note.trim().slice(0, 240) : null,
        query: input.query?.trim().slice(0, 100) || null,
      },
    }))

  // Suggesting something means you want it; re-suggesting just adds your vote.
  await prisma.productVote.upsert({
    where: { productId_userId: { productId: row.id, userId: user.id } },
    create: { productId: row.id, userId: user.id },
    update: {},
  })

  if (!existing) {
    await notify({
      tripId,
      actorId: user.id,
      to: "others",
      type: "gear_suggested",
      title: `${personName(user)} suggested a product`,
      body: row.title.slice(0, 100),
      url: tripUrl(tripId, "gear"),
    })
  }

  const full = await prisma.productSuggestion.findUniqueOrThrow({
    where: { id: row.id },
    include: {
      suggestedBy: { select: { id: true, name: true, email: true, image: true } },
      votes: { select: { userId: true } },
    },
  })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true, data: toPick(full) }
}

/** "I need this", toggles the caller's vote. */
export async function toggleProductVote(productId: string): Promise<Result<{ voted: boolean }>> {
  const product = await prisma.productSuggestion.findUnique({ where: { id: productId } })
  if (!product) return { ok: false, error: "That item is no longer on the list." }
  const { user, member } = await membershipFor(product.tripId)
  if (!member) return { ok: false, error: NOT_A_MEMBER }

  const key = { productId_userId: { productId, userId: user.id } }
  const existing = await prisma.productVote.findUnique({ where: key })
  if (existing) await prisma.productVote.delete({ where: key })
  else await prisma.productVote.create({ data: { productId, userId: user.id } })

  revalidatePath(`/trips/${product.tripId}`)
  return { ok: true, data: { voted: !existing } }
}

/** The person who suggested it, or an admin, can take an item off the list. */
export async function removeProduct(productId: string): Promise<Result> {
  const product = await prisma.productSuggestion.findUnique({ where: { id: productId } })
  if (!product) return { ok: true }
  const { user, member } = await membershipFor(product.tripId)
  if (!member) return { ok: false, error: NOT_A_MEMBER }
  if (member.role !== "ADMIN" && product.suggestedById !== user.id) {
    return { ok: false, error: "Only the person who suggested it (or the admin) can remove it." }
  }
  await prisma.productSuggestion.delete({ where: { id: productId } })
  revalidatePath(`/trips/${product.tripId}`)
  return { ok: true }
}

/** Copy a crew pick into the caller's private packing checklist as Gear. */
export async function addProductToMyChecklist(productId: string): Promise<Result<{ added: boolean }>> {
  const product = await prisma.productSuggestion.findUnique({ where: { id: productId } })
  if (!product) return { ok: false, error: "That item is no longer on the list." }
  const { user, member } = await membershipFor(product.tripId)
  if (!member) return { ok: false, error: NOT_A_MEMBER }

  const label = product.title.slice(0, 120)
  const existing = await prisma.checklistItem.findFirst({
    where: { tripId: product.tripId, userId: user.id, label },
  })
  if (existing) return { ok: true, data: { added: false } }

  const count = await prisma.checklistItem.count({ where: { tripId: product.tripId, userId: user.id } })
  await prisma.checklistItem.create({
    data: { tripId: product.tripId, userId: user.id, label, category: "GEAR", order: count + 100 },
  })
  revalidatePath(`/trips/${product.tripId}`)
  return { ok: true, data: { added: true } }
}
