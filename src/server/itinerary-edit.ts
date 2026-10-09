"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { adminContext } from "@/lib/access"
import { syncPlanState } from "@/lib/plan-state"
import { notify } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"

type ItemCategoryT =
  | "TRAVEL"
  | "STAY"
  | "FOOD"
  | "ACTIVITY"
  | "SHOPPING"
  | "EVENT"
  | "OTHER"

const CATEGORIES: ItemCategoryT[] = [
  "TRAVEL",
  "STAY",
  "FOOD",
  "ACTIVITY",
  "SHOPPING",
  "EVENT",
  "OTHER",
]

type Result =
  | { ok: true; votesReset: boolean }
  | { ok: false; error: string }

export type StopInput = {
  title: string
  startTime?: string
  category: string
  description?: string
}

/** Resolves an item the caller may edit: admin of a trip, newest plan only. */
async function editableItem(itemId: string) {
  const item = await prisma.itineraryItem.findUnique({
    where: { id: itemId },
    include: { day: { include: { itinerary: true } } },
  })
  if (!item) return { ok: false, error: "That stop no longer exists." } as const
  const tripId = item.day.itinerary.tripId
  const ctx = await adminContext(tripId, "edit the plan")
  if (!ctx.ok) return ctx
  const latest = await prisma.itinerary.findFirst({
    where: { tripId },
    orderBy: { generatedAt: "desc" },
    select: { id: true },
  })
  if (latest?.id !== item.day.itineraryId) {
    return { ok: false, error: "This plan was replaced — refresh to see the latest." } as const
  }
  return {
    ok: true,
    item,
    tripId,
    itineraryId: item.day.itineraryId,
    actor: ctx.user,
  } as const
}

/**
 * Any change to the plan invalidates the group's votes: nobody should stay
 * "approved" on a plan that changed under them.
 */
async function afterEdit(
  tripId: string,
  itineraryId: string,
  actor: { id: string; name?: string | null; email?: string | null }
): Promise<Result> {
  const cleared = await prisma.approval.deleteMany({ where: { itineraryId } })
  await syncPlanState(tripId)
  if (cleared.count > 0) {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { name: true } })
    await notify({
      tripId,
      actorId: actor.id,
      to: "voters",
      type: "plan_changed",
      title: "The plan changed — please vote again",
      body: trip?.name,
      url: tripUrl(tripId, "itinerary"),
    })
  }
  revalidatePath(`/trips/${tripId}`)
  return { ok: true, votesReset: cleared.count > 0 }
}

function cleanTime(value?: string) {
  return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null
}

function cleanStop(input: StopInput) {
  const title = input.title.trim().slice(0, 120)
  if (title.length < 2) {
    return { ok: false, error: "Give the stop a name." } as const
  }
  const category = (CATEGORIES as string[]).includes(input.category)
    ? (input.category as ItemCategoryT)
    : "ACTIVITY"
  return {
    ok: true,
    title,
    category,
    startTime: cleanTime(input.startTime),
    description: input.description?.trim().slice(0, 300) || null,
  } as const
}

export async function addStop(dayId: string, input: StopInput): Promise<Result> {
  const day = await prisma.itineraryDay.findUnique({
    where: { id: dayId },
    include: { itinerary: true, items: { orderBy: { order: "asc" } } },
  })
  if (!day) return { ok: false, error: "That day no longer exists." }
  const tripId = day.itinerary.tripId
  const ctx = await adminContext(tripId, "edit the plan")
  if (!ctx.ok) return ctx

  const stop = cleanStop(input)
  if (!stop.ok) return stop

  // Slot it in by time when it has one; otherwise it goes at the end.
  let index = day.items.length
  if (stop.startTime) {
    const after = day.items.findIndex((i) => i.startTime && i.startTime > stop.startTime!)
    if (after !== -1) index = after
  }

  const created = await prisma.itineraryItem.create({
    data: {
      dayId,
      order: index,
      title: stop.title,
      category: stop.category,
      startTime: stop.startTime,
      description: stop.description,
      why: "Added by the trip admin",
    },
  })
  const ids = day.items.map((i) => i.id)
  ids.splice(index, 0, created.id)
  await prisma.$transaction(
    ids.map((id, order) =>
      prisma.itineraryItem.update({ where: { id }, data: { order } })
    )
  )
  return afterEdit(tripId, day.itineraryId, ctx.user)
}

export async function updateStop(itemId: string, input: StopInput): Promise<Result> {
  const ctx = await editableItem(itemId)
  if (!ctx.ok) return ctx
  const stop = cleanStop(input)
  if (!stop.ok) return stop
  await prisma.itineraryItem.update({
    where: { id: itemId },
    data: {
      title: stop.title,
      category: stop.category,
      startTime: stop.startTime,
      description: stop.description,
    },
  })
  return afterEdit(ctx.tripId, ctx.itineraryId, ctx.actor)
}

export async function removeStop(itemId: string): Promise<Result> {
  const ctx = await editableItem(itemId)
  if (!ctx.ok) return ctx
  await prisma.itineraryItem.delete({ where: { id: itemId } })
  return afterEdit(ctx.tripId, ctx.itineraryId, ctx.actor)
}

export async function moveStop(
  itemId: string,
  direction: "up" | "down"
): Promise<Result> {
  const ctx = await editableItem(itemId)
  if (!ctx.ok) return ctx
  const siblings = await prisma.itineraryItem.findMany({
    where: { dayId: ctx.item.dayId },
    orderBy: { order: "asc" },
    select: { id: true },
  })
  const from = siblings.findIndex((s) => s.id === itemId)
  const to = direction === "up" ? from - 1 : from + 1
  if (from === -1 || to < 0 || to >= siblings.length) {
    return { ok: true, votesReset: false }
  }
  const ids = siblings.map((s) => s.id)
  ;[ids[from], ids[to]] = [ids[to], ids[from]]
  await prisma.$transaction(
    ids.map((id, order) =>
      prisma.itineraryItem.update({ where: { id }, data: { order } })
    )
  )
  return afterEdit(ctx.tripId, ctx.itineraryId, ctx.actor)
}
