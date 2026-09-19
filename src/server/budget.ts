"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { splitEqual } from "@/lib/budget"

type ExpenseCategoryT =
  | "FOOD"
  | "STAY"
  | "TRANSPORT"
  | "ACTIVITY"
  | "SHOPPING"
  | "MISC"
type SplitTypeT = "EQUAL" | "CUSTOM"
type ActionResult = { ok: true } | { ok: false; error: string }

export type AddExpenseInput = {
  description: string
  amount: number
  category: ExpenseCategoryT
  paidById: string
  splitType: SplitTypeT
  customShares?: { userId: string; amount: number }[]
}

export async function addExpense(
  tripId: string,
  input: AddExpenseInput
): Promise<ActionResult> {
  const user = await requireUser()
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { members: true },
  })
  if (!trip) return { ok: false, error: "Trip not found." }
  const me = trip.members.find((m) => m.userId === user.id)
  if (!me) return { ok: false, error: "You're not a member of this trip." }

  const description = input.description?.trim().slice(0, 120)
  if (!description) return { ok: false, error: "Add a description." }

  const amount = Math.round(Number(input.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid amount." }
  }

  const memberIds = trip.members.map((m) => m.userId)
  if (!memberIds.includes(input.paidById)) {
    return { ok: false, error: "The payer must be a trip member." }
  }

  let shares: { userId: string; amount: number }[]
  if (input.splitType === "CUSTOM") {
    const cs = (input.customShares ?? [])
      .filter((s) => memberIds.includes(s.userId) && Number(s.amount) > 0)
      .map((s) => ({
        userId: s.userId,
        amount: Math.round(Number(s.amount) * 100) / 100,
      }))
    if (cs.length === 0) {
      return { ok: false, error: "Add at least one person's share." }
    }
    const sum = cs.reduce((a, b) => a + b.amount, 0)
    if (Math.abs(sum - amount) > 0.5) {
      return {
        ok: false,
        error: `Custom shares add up to ${sum}, but the total is ${amount}.`,
      }
    }
    shares = cs
  } else {
    const split = splitEqual(amount, memberIds)
    shares = memberIds.map((u) => ({ userId: u, amount: split[u] }))
  }

  await prisma.expense.create({
    data: {
      tripId,
      description,
      amount,
      category: input.category as ExpenseCategoryT,
      paidById: input.paidById,
      splitType: input.splitType as SplitTypeT,
      createdById: user.id,
      shares: { create: shares },
    },
  })

  revalidatePath(`/trips/${tripId}`)
  return { ok: true }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const user = await requireUser()
  const exp = await prisma.expense.findUnique({ where: { id } })
  if (!exp) return { ok: false, error: "Expense not found." }
  const me = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId: exp.tripId, userId: user.id } },
  })
  if (!me) return { ok: false, error: "Not allowed." }
  await prisma.expense.delete({ where: { id } })
  revalidatePath(`/trips/${exp.tripId}`)
  return { ok: true }
}

export async function recordSettlement(
  tripId: string,
  fromUserId: string,
  toUserId: string,
  amount: number
): Promise<ActionResult> {
  const user = await requireUser()
  const me = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: user.id } },
  })
  if (!me) return { ok: false, error: "Not allowed." }
  const amt = Math.round(Number(amount) * 100) / 100
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, error: "Invalid amount." }
  }
  await prisma.settlement.create({
    data: { tripId, fromUserId, toUserId, amount: amt },
  })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true }
}
