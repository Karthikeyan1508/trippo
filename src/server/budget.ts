"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { convertAtRate, splitEqual } from "@/lib/budget"
import { formatMoney } from "@/lib/format"
import { notify, personName } from "@/server/notify"
import { tripUrl } from "@/lib/notifications"
import { convertCurrency } from "@/server/serpapi"

type ExpenseCategoryT =
  | "FOOD"
  | "STAY"
  | "TRANSPORT"
  | "ACTIVITY"
  | "SHOPPING"
  | "MISC"
type SplitTypeT = "EQUAL" | "CUSTOM"
type ActionResult<T = undefined> = T extends undefined ? { ok: true } | { ok: false; error: string } : { ok: true; data: T } | { ok: false; error: string }

export type AddExpenseInput = {
  description: string
  amount: number
  category: ExpenseCategoryT
  paidById: string
  splitType: SplitTypeT
  customShares?: { userId: string; amount: number }[]
  localAmount: number
  localCurrency: string
  exchangeRate: number
  exchangeRateAsOf?: string
}

type ValidExpense = Omit<AddExpenseInput, "customShares"> & {
  shares: { userId: string; amount: number }[]
}

function validateExpense(
  input: AddExpenseInput,
  members: { userId: string; role: string }[],
  tripCurrency: string
): ValidExpense | { error: string } {
  const description = input.description?.trim().slice(0, 120)
  if (!description) return { error: "Add a description." }
  const localAmount = Math.round(Number(input.localAmount) * 100) / 100
  const localCurrency = input.localCurrency.trim().toUpperCase()
  const exchangeRate = Number(input.exchangeRate)
  if (!Number.isFinite(localAmount) || localAmount <= 0) return { error: "Enter a valid local amount." }
  if (!/^[A-Z]{3}$/.test(localCurrency)) return { error: "Use a 3-letter currency code." }
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return { error: "Convert the amount before splitting it." }
  if (localCurrency === tripCurrency && exchangeRate !== 1) return { error: "The trip currency must use a 1:1 rate." }
  const amount = convertAtRate(localAmount, exchangeRate)
  if (Math.abs(Number(input.amount) - amount) > 0.01) return { error: "The converted total has changed. Convert it again." }
  if (!(["FOOD", "STAY", "TRANSPORT", "ACTIVITY", "SHOPPING", "MISC"] as string[]).includes(input.category)) {
    return { error: "Choose a valid category." }
  }
  if (input.splitType !== "EQUAL" && input.splitType !== "CUSTOM") {
    return { error: "Choose a valid split." }
  }
  const memberIds = members.filter((m) => m.role !== "OBSERVER").map((m) => m.userId)
  if (!memberIds.includes(input.paidById)) return { error: "The payer must be a travelling member." }
  const shares = input.splitType === "CUSTOM"
    ? (input.customShares ?? [])
        .filter((s) => memberIds.includes(s.userId) && Number(s.amount) > 0)
        .map((s) => ({ userId: s.userId, amount: Math.round(Number(s.amount) * 100) / 100 }))
    : memberIds.map((userId) => ({ userId, amount: splitEqual(amount, memberIds)[userId] }))
  if (shares.length === 0) return { error: "Add at least one person's share." }
  const sum = shares.reduce((total, share) => total + share.amount, 0)
  if (Math.abs(sum - amount) > 0.5) {
    return { error: `Custom shares add up to ${sum}, but the total is ${amount}.` }
  }
  return {
    description, amount, category: input.category, paidById: input.paidById, splitType: input.splitType, shares,
    localAmount, localCurrency, exchangeRate, exchangeRateAsOf: input.exchangeRateAsOf,
  }
}

export async function convertExpenseAmount(
  tripId: string,
  localAmount: number,
  localCurrency: string
): Promise<ActionResult<{ amount: number; rate: number; asOf?: string }>> {
  const user = await requireUser()
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: { members: true } })
  if (!trip) return { ok: false, error: "Trip not found." }
  if (!trip.members.some((m) => m.userId === user.id && m.role !== "OBSERVER")) return { ok: false, error: "Not allowed." }
  const amount = Math.round(Number(localAmount) * 100) / 100
  const from = localCurrency.trim().toUpperCase()
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(from)) {
    return { ok: false, error: "Enter an amount and a 3-letter currency code." }
  }
  if (from === trip.currency) return { ok: true, data: { amount, rate: 1 } }
  const converted = await convertCurrency(tripId, amount, from, trip.currency)
  if (!converted) return { ok: false, error: "We couldn't get a live exchange rate. Try again shortly." }
  return { ok: true, data: { amount: converted.converted, rate: converted.converted / amount, asOf: converted.asOf } }
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

  const expense = validateExpense(input, trip.members, trip.currency)
  if ("error" in expense) return { ok: false, error: expense.error }

  await prisma.expense.create({
    data: {
      tripId,
      description: expense.description,
      amount: expense.amount,
      localAmount: expense.localAmount,
      localCurrency: expense.localCurrency,
      exchangeRate: expense.exchangeRate,
      exchangeRateAsOf: expense.exchangeRateAsOf ?? null,
      category: expense.category as ExpenseCategoryT,
      paidById: expense.paidById,
      splitType: expense.splitType as SplitTypeT,
      createdById: user.id,
      shares: { create: expense.shares },
    },
  })

  await notify({
    tripId,
    actorId: user.id,
    to: { users: expense.shares.map((s) => s.userId) },
    type: "expense_added",
    title: `${personName(user)} added an expense`,
    body: `${expense.description} · ${formatMoney(expense.amount, trip.currency)}`,
    url: tripUrl(tripId, "budget"),
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
  if (me.role !== "ADMIN" && exp.createdById !== user.id) {
    return {
      ok: false,
      error: "Only the person who added this expense (or the admin) can delete it.",
    }
  }
  await prisma.expense.delete({ where: { id } })
  revalidatePath(`/trips/${exp.tripId}`)
  return { ok: true }
}

/** Propose an expense edit. The published expense remains unchanged until an admin approves it. */
export async function requestExpenseEdit(
  expenseId: string,
  input: AddExpenseInput
): Promise<ActionResult> {
  const user = await requireUser()
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { trip: { include: { members: true } } },
  })
  if (!expense) return { ok: false, error: "Expense not found." }
  if (expense.createdById !== user.id) {
    return { ok: false, error: "Only the person who added this expense can edit it." }
  }
  const proposed = validateExpense(input, expense.trip.members, expense.trip.currency)
  if ("error" in proposed) return { ok: false, error: proposed.error }
  const pending = await prisma.expenseEdit.findFirst({
    where: { expenseId, status: "PENDING" },
    select: { id: true },
  })
  if (pending) return { ok: false, error: "An edit to this expense is already awaiting approval." }

  await prisma.expenseEdit.create({
    data: {
      expenseId,
      requestedById: user.id,
      description: proposed.description,
      amount: proposed.amount,
      localAmount: proposed.localAmount,
      localCurrency: proposed.localCurrency,
      exchangeRate: proposed.exchangeRate,
      exchangeRateAsOf: proposed.exchangeRateAsOf ?? null,
      category: proposed.category,
      paidById: proposed.paidById,
      splitType: proposed.splitType,
      shares: proposed.shares,
    },
  })
  await notify({
    tripId: expense.tripId,
    actorId: user.id,
    to: "admins",
    type: "expense_edit_requested",
    title: `${personName(user)} requested an expense edit`,
    body: expense.description,
    url: tripUrl(expense.tripId, "budget"),
  })
  revalidatePath(`/trips/${expense.tripId}`)
  return { ok: true }
}

/** Admin-only: publish or reject the pending edit. */
export async function reviewExpenseEdit(
  editId: string,
  approved: boolean
): Promise<ActionResult> {
  const user = await requireUser()
  const edit = await prisma.expenseEdit.findUnique({
    where: { id: editId },
    include: { expense: { include: { trip: { include: { members: true } } } } },
  })
  if (!edit) return { ok: false, error: "Edit request not found." }
  const admin = edit.expense.trip.members.find((m) => m.userId === user.id)
  if (!admin || admin.role !== "ADMIN") return { ok: false, error: "Only a trip admin can review expense edits." }
  if (edit.status !== "PENDING") return { ok: false, error: "This edit has already been reviewed." }

  if (approved) {
    const rawShares = Array.isArray(edit.shares) ? edit.shares : []
    const proposed = validateExpense(
      {
        description: edit.description,
        amount: edit.amount,
        localAmount: edit.localAmount ?? edit.amount,
        localCurrency: edit.localCurrency ?? edit.expense.trip.currency,
        exchangeRate: edit.exchangeRate ?? 1,
        exchangeRateAsOf: edit.exchangeRateAsOf ?? undefined,
        category: edit.category,
        paidById: edit.paidById,
        splitType: edit.splitType,
        customShares: rawShares.filter(
          (share): share is { userId: string; amount: number } =>
            typeof share === "object" && share !== null &&
            typeof (share as { userId?: unknown }).userId === "string" &&
            typeof (share as { amount?: unknown }).amount === "number"
        ) as { userId: string; amount: number }[],
      },
      edit.expense.trip.members,
      edit.expense.trip.currency
    )
    if ("error" in proposed) return { ok: false, error: `This edit can no longer be approved: ${proposed.error}` }
    await prisma.$transaction([
      prisma.expense.update({
        where: { id: edit.expenseId },
        data: {
          description: proposed.description,
          amount: proposed.amount,
          localAmount: proposed.localAmount,
          localCurrency: proposed.localCurrency,
          exchangeRate: proposed.exchangeRate,
          exchangeRateAsOf: proposed.exchangeRateAsOf ?? null,
          category: proposed.category,
          paidById: proposed.paidById,
          splitType: proposed.splitType,
          shares: { deleteMany: {}, create: proposed.shares },
        },
      }),
      prisma.expenseEdit.update({ where: { id: editId }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: user.id } }),
    ])
  } else {
    await prisma.expenseEdit.update({ where: { id: editId }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: user.id } })
  }

  await notify({
    tripId: edit.expense.tripId,
    actorId: user.id,
    to: { users: [edit.requestedById] },
    type: approved ? "expense_edit_approved" : "expense_edit_rejected",
    title: approved ? "Your expense edit was approved" : "Your expense edit was not approved",
    body: edit.expense.description,
    url: tripUrl(edit.expense.tripId, "budget"),
  })
  revalidatePath(`/trips/${edit.expense.tripId}`)
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
  if (fromUserId === toUserId) {
    return { ok: false, error: "Payer and receiver must be different people." }
  }
  const parties = await prisma.tripMember.count({
    where: { tripId, userId: { in: [fromUserId, toUserId] } },
  })
  if (parties !== 2) {
    return { ok: false, error: "Both people must be on this trip." }
  }
  if (me.role !== "ADMIN" && user.id !== fromUserId && user.id !== toUserId) {
    return {
      ok: false,
      error: "Only the payer, the receiver or the admin can record a payment.",
    }
  }
  const amt = Math.round(Number(amount) * 100) / 100
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, error: "Invalid amount." }
  }
  await prisma.settlement.create({
    data: { tripId, fromUserId, toUserId, amount: amt },
  })
  const [people, tripRow] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [fromUserId, toUserId] } },
      select: { id: true, name: true, email: true },
    }),
    prisma.trip.findUnique({ where: { id: tripId }, select: { currency: true } }),
  ])
  const nameOf = (id: string) => {
    const u = people.find((p) => p.id === id)
    return u ? personName(u) : "Someone"
  }
  await notify({
    tripId,
    actorId: user.id,
    to: { users: [fromUserId, toUserId] },
    type: "payment_received",
    title: `${nameOf(fromUserId)} paid ${nameOf(toUserId)}`,
    body: formatMoney(amt, tripRow?.currency ?? "INR"),
    url: tripUrl(tripId, "budget"),
  })
  revalidatePath(`/trips/${tripId}`)
  return { ok: true }
}
