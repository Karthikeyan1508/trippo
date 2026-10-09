"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { notify } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"
import { fetchTravelTips } from "@/server/serpapi"
import {
  generatePrepWithGroq,
  type PrepContext,
  type PrepPack,
} from "@/server/groq"

type ChecklistCategoryT = "DOCUMENT" | "PACKING" | "BOOKING" | "GEAR" | "OTHER"
type ActionResult = { ok: true; source?: string } | { ok: false; error: string }

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Generate the destination prep pack (etiquette, documents, packing). Admin only. */
export async function generatePrep(tripId: string): Promise<ActionResult> {
  const user = await requireUser()

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { members: { include: { preference: true } } },
  })
  if (!trip) return { ok: false, error: "Trip not found." }

  const me = trip.members.find((m) => m.userId === user.id)
  if (!me || me.role !== "ADMIN") {
    return { ok: false, error: "Only the trip admin can generate the prep guide." }
  }

  const interests = [
    ...new Set(
      trip.members.flatMap((m) => m.preference?.interests ?? [])
    ),
  ]
  const days = Math.max(
    1,
    Math.round((trip.endDate.getTime() - trip.startDate.getTime()) / 86_400_000) + 1
  )

  const webTips = await fetchTravelTips(tripId, trip.destination)

  const ctx: PrepContext = {
    destination: trip.destination,
    originCity: trip.originCity,
    startDate: iso(trip.startDate),
    endDate: iso(trip.endDate),
    days,
    tripType: trip.tripType,
    interests,
    webTips: webTips || undefined,
  }

  let pack = await generatePrepWithGroq(ctx)
  const usedGroq = pack !== null
  if (!pack) pack = buildSamplePrep(ctx)

  const source = usedGroq ? "AI" : "SAMPLE"

  await prisma.prepGuide.upsert({
    where: { tripId },
    create: {
      tripId,
      summary: pack.summary,
      etiquette: pack.etiquette,
      documents: pack.documents,
      packing: pack.packing,
      phrases: pack.phrases,
      source,
      model: usedGroq ? process.env.GROQ_MODEL || "openai/gpt-oss-120b" : null,
    },
    update: {
      summary: pack.summary,
      etiquette: pack.etiquette,
      documents: pack.documents,
      packing: pack.packing,
      phrases: pack.phrases,
      source,
      model: usedGroq ? process.env.GROQ_MODEL || "openai/gpt-oss-120b" : null,
      generatedAt: new Date(),
    },
  })

  await notify({
    tripId,
    actorId: user.id,
    to: "others",
    type: "prep_ready",
    title: "The prep guide is ready",
    body: `Etiquette, phrases and a packing list · ${trip.name}`,
    url: tripUrl(tripId, "prep"),
  })

  revalidatePath(`/trips/${tripId}`)
  return { ok: true, source }
}

export async function toggleChecklistItem(itemId: string): Promise<ActionResult> {
  const user = await requireUser()
  const item = await prisma.checklistItem.findUnique({ where: { id: itemId } })
  if (!item || item.userId !== user.id) {
    return { ok: false, error: "Item not found." }
  }
  await prisma.checklistItem.update({
    where: { id: itemId },
    data: { isDone: !item.isDone },
  })
  revalidatePath(`/trips/${item.tripId}`)
  return { ok: true }
}

export async function addChecklistItem(
  tripId: string,
  label: string,
  category: ChecklistCategoryT = "OTHER"
): Promise<ActionResult> {
  const user = await requireUser()
  const clean = label.trim().slice(0, 120)
  if (!clean) return { ok: false, error: "Enter something to add." }

  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: user.id } },
  })
  if (!member) return { ok: false, error: "You're not a member of this trip." }

  const count = await prisma.checklistItem.count({
    where: { tripId, userId: user.id },
  })
  await prisma.checklistItem.create({
    data: { tripId, userId: user.id, label: clean, category, order: count + 100 },
  })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true }
}

function buildSamplePrep(ctx: PrepContext): PrepPack {
  return {
    summary: `Prep checklist for your ${ctx.days}-day trip to ${ctx.destination}. Add API keys for a destination-tailored guide.`,
    etiquette: [
      "Dress modestly when visiting temples or religious sites.",
      "Carry small cash — many local vendors don't take cards.",
      "Ask before photographing people or ceremonies.",
      "Remove footwear where signs or hosts request it.",
      "Bargain politely at markets; a smile goes a long way.",
      "Keep a digital and paper copy of your ID and bookings.",
    ],
    documents: [
      "Government photo ID (Aadhaar / passport)",
      "Flight / train / bus tickets",
      "Hotel booking confirmations",
      "Travel insurance details",
      "Emergency contact list",
      "Any activity permits (trek / protected areas)",
    ],
    packing: [
      {
        category: "Clothing",
        items: ["Comfortable walking shoes", "Light layers", "Rain jacket", "Sleepwear"],
      },
      {
        category: "Toiletries",
        items: ["Sunscreen", "Toothbrush & paste", "Medications", "Hand sanitiser"],
      },
      {
        category: "Gear",
        items: ["Power bank", "Universal charger", "Reusable water bottle", "Daypack"],
      },
      {
        category: "Documents",
        items: ["ID copies", "Printed tickets", "Cash & cards"],
      },
    ],
    phrases: [],
  }
}
