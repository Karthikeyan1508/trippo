import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  PlaneTakeoff,
  Wallet,
  Crown,
  CheckCircle2,
  Circle,
  Sparkles,
  Map as MapIcon,
  ListChecks,
  Download,
  LayoutDashboard,
  Users,
  SlidersHorizontal,
  BarChart3,
  Route,
} from "lucide-react"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import {
  formatDateRange,
  tripDurationDays,
  prettifyEnum,
  formatMoney,
} from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs as TabsPrimitive } from "radix-ui"
import { InviteDialog } from "./invite-dialog"
import { RevokeInviteButton } from "./revoke-invite-button"
import { PreferenceForm } from "./preference-form"
import { GroupInsights } from "./group-insights"
import { ItineraryView } from "./itinerary-view"
import { ItineraryMap, type MapStop } from "./itinerary-map"
import { GenerateItineraryButton } from "./generate-itinerary-button"
import { ApprovalPanel } from "./approval-panel"
import { PrepView } from "./prep-view"
import { Checklist } from "./checklist"
import { GeneratePrepButton } from "./generate-prep-button"
import { LiveMap } from "./live-map"
import { AddExpenseDialog } from "./add-expense-dialog"
import { SettleButton, DeleteExpenseButton } from "./budget-buttons"
import { computeBalances, settleUp } from "@/lib/budget"
import type { PreferenceInput } from "@/lib/validators"

function memberInitials(name?: string | null, email?: string | null) {
  const s = name || email || "?"
  return s
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

const NAV_ITEM =
  "group flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-primary/10 data-[state=active]:text-primary lg:w-full"

const ROADMAP = [
  {
    icon: Sparkles,
    title: "AI itinerary",
    desc: "Real flights, stays & places → a day-by-day plan.",
  },
  {
    icon: ListChecks,
    title: "Checklists & etiquette",
    desc: "Docs, packing and destination know-how.",
  },
  {
    icon: MapIcon,
    title: "Live map & budget",
    desc: "See everyone on the trip and split expenses.",
  },
]

export default async function TripPage({
  params,
}: PageProps<"/trips/[id]">) {
  const { id } = await params
  const user = await requireUser()

  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      members: {
        include: { user: true, preference: true },
        orderBy: { joinedAt: "asc" },
      },
      invites: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
      },
      prep: true,
    },
  })

  if (!trip) notFound()

  const myMember = trip.members.find((m) => m.userId === user.id)
  if (!myMember) notFound()

  const itinerary = await prisma.itinerary.findFirst({
    where: { tripId: id },
    orderBy: { generatedAt: "desc" },
    include: {
      days: {
        orderBy: { dayNumber: "asc" },
        include: { items: { orderBy: { order: "asc" } } },
      },
      approvals: true,
    },
  })

  const isAdmin = myMember.role === "ADMIN"

  type ApprovalStatus = "APPROVED" | "REJECTED" | "PENDING"
  const approvers = trip.members
    .filter((m) => m.role !== "OBSERVER")
    .map((m) => {
      const a = itinerary?.approvals.find((x) => x.userId === m.userId)
      return {
        userId: m.userId,
        name: m.user.name,
        image: m.user.image,
        email: m.user.email,
        status: (a?.status ?? "PENDING") as ApprovalStatus,
        reason: a?.reason ?? null,
      }
    })
  const myStatus = (itinerary?.approvals.find((a) => a.userId === user.id)
    ?.status ?? "PENDING") as ApprovalStatus
  const planLocked = itinerary?.status === "FINAL"
  const canApprove = myMember.role !== "OBSERVER"

  // Seed this member's checklist from the prep guide on first view.
  if (trip.prep) {
    const existing = await prisma.checklistItem.count({
      where: { tripId: id, userId: user.id },
    })
    if (existing === 0) {
      const docs = ((trip.prep.documents as unknown as string[]) ?? []).map(
        (label, i) => ({
          tripId: id,
          userId: user.id,
          label,
          category: "DOCUMENT" as const,
          order: i,
        })
      )
      const packingCats =
        (trip.prep.packing as unknown as {
          category: string
          items: string[]
        }[]) ?? []
      const packing = packingCats.flatMap((c, ci) =>
        c.items.map((label, ii) => ({
          tripId: id,
          userId: user.id,
          label,
          category: "PACKING" as const,
          order: 100 + ci * 20 + ii,
        }))
      )
      const seed = [...docs, ...packing]
      if (seed.length > 0) {
        await prisma.checklistItem.createMany({ data: seed })
      }
    }
  }
  const checklist = await prisma.checklistItem.findMany({
    where: { tripId: id, userId: user.id },
    orderBy: { order: "asc" },
  })

  // Located itinerary stops → numbered pins for the itinerary map,
  // and the starting center for the live map.
  const stops: MapStop[] = []
  const stopNumbers: Record<string, number> = {}
  if (itinerary) {
    let n = 0
    for (const d of itinerary.days) {
      for (const it of d.items) {
        if (it.lat != null && it.lng != null) {
          n++
          stops.push({ n, lat: it.lat, lng: it.lng, title: it.title })
          stopNumbers[it.id] = n
        }
      }
    }
  }
  const mapCenter =
    stops.length > 0 ? { lat: stops[0].lat, lng: stops[0].lng } : null

  // Budget: expenses, settlements, balances and settle-up plan.
  const [expenses, settlements] = await Promise.all([
    prisma.expense.findMany({
      where: { tripId: id },
      include: { shares: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.settlement.findMany({
      where: { tripId: id },
      orderBy: { createdAt: "desc" },
    }),
  ])
  const memberIds = trip.members.map((m) => m.userId)
  const nameById = new Map(
    trip.members.map((m) => [m.userId, m.user.name ?? m.user.email ?? "Member"])
  )
  const membersForExpense = trip.members.map((m) => ({
    userId: m.userId,
    name: m.user.name ?? m.user.email ?? "Member",
  }))
  const balances = computeBalances(
    memberIds,
    expenses.map((e) => ({ amount: e.amount, paidById: e.paidById })),
    expenses.flatMap((e) =>
      e.shares.map((s) => ({ userId: s.userId, amount: s.amount }))
    ),
    settlements.map((s) => ({
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amount: s.amount,
    }))
  )
  const transfers = settleUp(balances)
  const totalSpent = expenses.reduce((a, e) => a + e.amount, 0)
  const myBalance = balances[user.id] ?? 0

  const EXPENSE_EMOJI: Record<string, string> = {
    FOOD: "🍽️",
    STAY: "🏨",
    TRANSPORT: "🚕",
    ACTIVITY: "🎟️",
    SHOPPING: "🛍️",
    MISC: "📦",
  }
  const days = tripDurationDays(trip.startDate, trip.endDate)
  const p = myMember.preference

  const prefDefaults: PreferenceInput = {
    age: p?.age != null ? String(p.age) : "",
    gender: p?.gender ?? "",
    diet: p?.diet ?? "",
    stayTypes: p?.stayTypes ?? [],
    transports: p?.transports ?? [],
    interests: p?.interests ?? [],
    pace: p?.pace ?? "",
    budgetPerDay: p?.budgetPerDay != null ? String(p.budgetPerDay) : "",
    accessibility: p?.accessibility ?? "",
    mustCoverPlaces: p?.mustCoverPlaces ?? "",
  }

  const filledCount = trip.members.filter((m) => m.preference).length

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
        <Link href="/dashboard">
          <ArrowLeft className="size-4" />
          All trips
        </Link>
      </Button>

      {/* Trip header */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {trip.name}
              </h1>
              <Badge variant="secondary">{prettifyEnum(trip.status)}</Badge>
              <Badge variant="outline">{prettifyEnum(trip.tripType)}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" />
                {trip.destination}
              </span>
              {trip.originCity && (
                <span className="flex items-center gap-1.5">
                  <PlaneTakeoff className="size-4" />
                  from {trip.originCity}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {formatDateRange(trip.startDate, trip.endDate)} · {days} days
              </span>
              {trip.budgetPerPerson != null && (
                <span className="flex items-center gap-1.5">
                  <Wallet className="size-4" />
                  {formatMoney(trip.budgetPerPerson, trip.currency)}/person
                </span>
              )}
            </div>
          </div>
          {isAdmin && <InviteDialog tripId={trip.id} />}
        </div>
      </div>

      {/* Sidebar navigation + content */}
      <TabsPrimitive.Root
        defaultValue="overview"
        orientation="vertical"
        className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start"
      >
        <TabsPrimitive.List className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-2 lg:sticky lg:top-20 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible">
          <TabsPrimitive.Trigger value="overview" className={NAV_ITEM}>
            <LayoutDashboard className="size-4 shrink-0" /> Overview
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="itinerary" className={NAV_ITEM}>
            <Route className="size-4 shrink-0" /> Itinerary
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="prep" className={NAV_ITEM}>
            <ListChecks className="size-4 shrink-0" /> Prep
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="live" className={NAV_ITEM}>
            <MapIcon className="size-4 shrink-0" /> Live map
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="budget" className={NAV_ITEM}>
            <Wallet className="size-4 shrink-0" /> Budget
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="members" className={NAV_ITEM}>
            <Users className="size-4 shrink-0" /> Members
            <span className="ml-auto rounded bg-muted px-1.5 text-xs group-data-[state=active]:bg-primary/15">
              {trip.members.length}
            </span>
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="preferences" className={NAV_ITEM}>
            <SlidersHorizontal className="size-4 shrink-0" /> My preferences
          </TabsPrimitive.Trigger>
          {isAdmin && (
            <TabsPrimitive.Trigger value="insights" className={NAV_ITEM}>
              <BarChart3 className="size-4 shrink-0" /> Group insights
            </TabsPrimitive.Trigger>
          )}
        </TabsPrimitive.List>

        <div className="min-w-0 flex-1 space-y-0">
          {/* content */}

        {/* Overview */}
        <TabsPrimitive.Content value="overview" className="mt-5 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">Members</p>
              <p className="mt-1 text-2xl font-semibold">
                {trip.members.length}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">Duration</p>
              <p className="mt-1 text-2xl font-semibold">{days} days</p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Preferences filled
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {filledCount}
                <span className="text-base font-normal text-muted-foreground">
                  /{trip.members.length}
                </span>
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-medium">Coming up in the plan</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Once everyone&apos;s preferences are in, these unlock next.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {ROADMAP.map((r) => (
                <div
                  key={r.title}
                  className="rounded-lg border border-dashed p-4"
                >
                  <r.icon className="mb-2 size-5 text-primary" />
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </TabsPrimitive.Content>

        {/* Itinerary */}
        <TabsPrimitive.Content value="itinerary" className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">Trip itinerary</h3>
              <p className="text-sm text-muted-foreground">
                {itinerary
                  ? "Your group's day-by-day plan."
                  : "A day-by-day plan built from the group's preferences and live place data."}
              </p>
            </div>
            {isAdmin && (
              <GenerateItineraryButton
                tripId={trip.id}
                hasExisting={!!itinerary}
              />
            )}
          </div>

          {itinerary ? (
            <>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                <div className="min-w-0 space-y-5">
                  <ItineraryView
                    itinerary={itinerary}
                    stopNumbers={stopNumbers}
                  />
                </div>
                <div className="lg:sticky lg:top-20">
                  <ItineraryMap stops={stops} />
                </div>
              </div>
              <ApprovalPanel
                itineraryId={itinerary.id}
                locked={planLocked}
                canApprove={canApprove}
                myStatus={myStatus}
                approvers={approvers}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
              <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-7" />
              </div>
              <h3 className="text-lg font-semibold">No plan yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {isAdmin
                  ? "Generate a day-by-day itinerary from everyone's preferences."
                  : "The trip admin hasn't generated the plan yet."}
              </p>
              {isAdmin && (
                <div className="mt-6">
                  <GenerateItineraryButton tripId={trip.id} />
                </div>
              )}
            </div>
          )}
        </TabsPrimitive.Content>

        {/* Prep */}
        <TabsPrimitive.Content value="prep" className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">Trip prep</h3>
              <p className="text-sm text-muted-foreground">
                Etiquette, documents, packing — and your personal checklist.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(trip.prep || itinerary) && (
                <Button asChild variant="outline" className="gap-2">
                  <a
                    href={`/print/trips/${trip.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="size-4" />
                    Download PDF
                  </a>
                </Button>
              )}
              {isAdmin && (
                <GeneratePrepButton tripId={trip.id} hasExisting={!!trip.prep} />
              )}
            </div>
          </div>

          {trip.prep ? (
            <>
              <PrepView
                prep={{
                  summary: trip.prep.summary,
                  source: trip.prep.source,
                  etiquette: (trip.prep.etiquette as unknown as string[]) ?? [],
                  documents: (trip.prep.documents as unknown as string[]) ?? [],
                  packing:
                    (trip.prep.packing as unknown as {
                      category: string
                      items: string[]
                    }[]) ?? [],
                  phrases:
                    (trip.prep.phrases as unknown as {
                      phrase: string
                      meaning: string
                    }[]) ?? [],
                }}
              />
              <Checklist
                tripId={trip.id}
                items={checklist.map((c) => ({
                  id: c.id,
                  label: c.label,
                  category: c.category,
                  isDone: c.isDone,
                }))}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
              <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <ListChecks className="size-7" />
              </div>
              <h3 className="text-lg font-semibold">No prep guide yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {isAdmin
                  ? "Generate destination etiquette, a documents list and a packing checklist."
                  : "The trip admin hasn't generated the prep guide yet."}
              </p>
              {isAdmin && (
                <div className="mt-6">
                  <GeneratePrepButton tripId={trip.id} />
                </div>
              )}
            </div>
          )}
        </TabsPrimitive.Content>

        {/* Live map */}
        <TabsPrimitive.Content value="live" className="mt-5">
          <LiveMap
            tripId={trip.id}
            initialCenter={mapCenter}
            canEdit={myMember.role !== "OBSERVER"}
          />
        </TabsPrimitive.Content>

        {/* Budget */}
        <TabsPrimitive.Content value="budget" className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">Shared budget</h3>
              <p className="text-sm text-muted-foreground">
                Log expenses, split them, and settle up.
              </p>
            </div>
            <AddExpenseDialog
              tripId={trip.id}
              members={membersForExpense}
              currentUserId={user.id}
              currency={trip.currency}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">Total spent</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatMoney(totalSpent, trip.currency)}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">Per person</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatMoney(
                  memberIds.length ? totalSpent / memberIds.length : 0,
                  trip.currency
                )}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">Your balance</p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  myBalance > 0.01
                    ? "text-emerald-600 dark:text-emerald-400"
                    : myBalance < -0.01
                      ? "text-destructive"
                      : ""
                }`}
              >
                {myBalance > 0.01 ? "+" : ""}
                {formatMoney(myBalance, trip.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {myBalance > 0.01
                  ? "you're owed"
                  : myBalance < -0.01
                    ? "you owe"
                    : "all settled"}
              </p>
            </div>
          </div>

          {transfers.length > 0 ? (
            <div className="rounded-xl border bg-card">
              <div className="border-b px-5 py-3">
                <h4 className="font-medium">Settle up</h4>
              </div>
              <ul className="divide-y">
                {transfers.map((t, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <span>
                      <span className="font-medium">{nameById.get(t.from)}</span>{" "}
                      pays{" "}
                      <span className="font-medium">{nameById.get(t.to)}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold">
                        {formatMoney(t.amount, trip.currency)}
                      </span>
                      <SettleButton
                        tripId={trip.id}
                        fromUserId={t.from}
                        toUserId={t.to}
                        amount={t.amount}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            expenses.length > 0 && (
              <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                Everyone&apos;s settled up. 🎉
              </div>
            )
          )}

          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3">
              <h4 className="font-medium">Expenses</h4>
            </div>
            {expenses.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                No expenses yet — add the first one.
              </p>
            ) : (
              <ul className="divide-y">
                {expenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-lg">
                      {EXPENSE_EMOJI[e.category] ?? "📦"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Paid by {nameById.get(e.paidById)} ·{" "}
                        {e.splitType === "EQUAL" ? "split equally" : "custom split"}{" "}
                        · {e.shares.length} people
                      </p>
                    </div>
                    <span className="font-semibold">
                      {formatMoney(e.amount, trip.currency)}
                    </span>
                    <DeleteExpenseButton id={e.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsPrimitive.Content>

        {/* Members */}
        <TabsPrimitive.Content value="members" className="mt-5 space-y-6">
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="font-medium">On this trip</h3>
              {isAdmin && <InviteDialog tripId={trip.id} />}
            </div>
            <ul className="divide-y">
              {trip.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <Avatar className="size-9">
                    <AvatarImage
                      src={m.user.image ?? undefined}
                      alt={m.user.name ?? ""}
                    />
                    <AvatarFallback>
                      {memberInitials(m.user.name, m.user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {m.user.name ?? m.user.email}
                      {m.userId === user.id && (
                        <span className="text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {m.user.email}
                    </p>
                  </div>
                  {m.preference ? (
                    <span
                      title="Preferences filled"
                      className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="size-4" />
                    </span>
                  ) : (
                    <span
                      title="No preferences yet"
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <Circle className="size-4" />
                    </span>
                  )}
                  <Badge
                    variant={m.role === "ADMIN" ? "default" : "outline"}
                    className="gap-1"
                  >
                    {m.role === "ADMIN" && <Crown className="size-3" />}
                    {prettifyEnum(m.role)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>

          {trip.invites.length > 0 && (
            <div className="rounded-xl border bg-card">
              <div className="border-b px-5 py-3">
                <h3 className="font-medium">Pending invites</h3>
              </div>
              <ul className="divide-y">
                {trip.invites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited as {prettifyEnum(inv.role)}
                      </p>
                    </div>
                    <Badge variant="secondary">Pending</Badge>
                    {isAdmin && (
                      <RevokeInviteButton
                        tripId={trip.id}
                        inviteId={inv.id}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsPrimitive.Content>

        {/* My preferences */}
        <TabsPrimitive.Content value="preferences" className="mt-5">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="font-medium">Your preferences</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              These shape the AI plan — the more the group shares, the better
              the itinerary.
            </p>
            <div className="mt-6">
              <PreferenceForm tripId={trip.id} defaultValues={prefDefaults} />
            </div>
          </div>
        </TabsPrimitive.Content>

        {/* Group insights (admin) */}
        {isAdmin && (
          <TabsPrimitive.Content value="insights" className="mt-5">
            <GroupInsights
              members={trip.members.map((m) => ({
                preference: m.preference
                  ? {
                      diet: m.preference.diet,
                      pace: m.preference.pace,
                      stayTypes: m.preference.stayTypes,
                      transports: m.preference.transports,
                      interests: m.preference.interests,
                      budgetPerDay: m.preference.budgetPerDay,
                    }
                  : null,
              }))}
            />
          </TabsPrimitive.Content>
        )}
        </div>
      </TabsPrimitive.Root>
    </div>
  )
}
