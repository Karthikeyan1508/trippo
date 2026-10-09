"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { notify } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"
import { fetchHotels, fetchLocalTransport, type TransportLite } from "@/server/serpapi"

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function member(tripId: string, userId: string) {
  return prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } })
}

export async function findTransport(tripId: string, from: string, to: string): Promise<Result<TransportLite[]>> {
  const user = await requireUser()
  if (!(await member(tripId, user.id))) return { ok: false, error: "You’re not a member of this trip." }
  const cleanFrom = from.trim().slice(0, 120); const cleanTo = to.trim().slice(0, 120)
  if (!cleanFrom || !cleanTo) return { ok: false, error: "Add both the start and end location." }
  const options = await fetchLocalTransport(tripId, cleanFrom, cleanTo)
  return { ok: true, data: options }
}

export async function refreshStayOptions(tripId: string): Promise<Result<number>> {
  const user = await requireUser()
  const me = await member(tripId, user.id)
  if (!me || me.role !== "ADMIN") return { ok: false, error: "Only the trip admin can research stays." }
  const trip = await prisma.trip.findUnique({ where: { id: tripId } })
  if (!trip) return { ok: false, error: "Trip not found." }
  const hotels = await fetchHotels(tripId, trip.destination, trip.startDate.toISOString().slice(0, 10), trip.endDate.toISOString().slice(0, 10))
  if (hotels.length === 0) return { ok: false, error: "No stay options returned. Check the SerpApi key and try again." }
  await prisma.$transaction([
    prisma.stayOption.deleteMany({ where: { tripId } }),
    prisma.stayOption.createMany({ data: hotels.slice(0, 3).map((hotel) => ({ tripId, name: hotel.name, price: hotel.price ?? null, rating: hotel.rating ?? null, type: hotel.type ?? null, amenities: hotel.amenities ?? [], link: hotel.link ?? null, thumbnail: hotel.thumbnail ?? null })) }),
  ])
  revalidatePath(`/trips/${tripId}`)
  return { ok: true, data: Math.min(3, hotels.length) }
}

export async function selectStay(tripId: string, stayId: string): Promise<Result<undefined>> {
  const user = await requireUser(); const me = await member(tripId, user.id)
  if (!me || me.role !== "ADMIN") return { ok: false, error: "Only the trip admin can make the group’s stay choice." }
  const stay = await prisma.stayOption.findFirst({ where: { id: stayId, tripId } })
  if (!stay) return { ok: false, error: "Stay option not found." }
  await prisma.$transaction([
    prisma.stayOption.updateMany({ where: { tripId }, data: { selected: false } }),
    prisma.stayOption.update({ where: { id: stayId }, data: { selected: true } }),
  ])
  await notify({
    tripId,
    actorId: user.id,
    to: "others",
    type: "stay_chosen",
    title: "The group stay is chosen",
    body: stay.name,
    url: tripUrl(tripId, "stay"),
  })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true, data: undefined }
}
