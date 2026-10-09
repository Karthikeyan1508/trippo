import { notFound } from "next/navigation"
import { after } from "next/server"
import { differenceInCalendarDays, startOfDay } from "date-fns"
import { Clapperboard } from "lucide-react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import {
  formatDateRange,
  formatMoney,
  prettifyEnum,
  tripDurationDays,
} from "@/lib/format"
import { computeBalances, settleUp } from "@/lib/budget"
import { computeJourney, phaseLabel, tripPhase } from "@/lib/journey"
import { activityIconKey } from "@/lib/trip-icons"
import type { PreferenceInput, CreateTripInput } from "@/lib/validators"
import {
  Sidebar,
  SidebarFooter,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar"
import { resolveCovers } from "@/server/cover"
import { allowedTabs } from "./nav-config"
import { TripTabs } from "./trip-tabs"
import { TripNav, type NavBadges } from "./trip-nav"
import { NavUser } from "./nav-user"
import { TripSidebarHeader } from "./trip-sidebar-header"
import { TripTopBar } from "./trip-top-bar"
import { InviteDialog } from "./invite-dialog"
import { TripHub, type HubMember } from "./trip-hub"
import { ItineraryTab } from "./itinerary-tab"
import { TravelOptions } from "./travel-options"
import { GearTab } from "./gear-tab"
import { toPick } from "@/lib/gear"
import { PreferenceForm } from "./preference-form"
import { PollsPanel, type PollData } from "./polls-panel"
import { CrewTab } from "./crew-tab"
import { GroupInsights } from "./group-insights"
import { SettingsTab } from "./settings-tab"
import { PrepTab } from "./prep-tab"
import { LiveMap } from "./live-map"
import { TripModeControls } from "@/components/trip-mode-controls"
import { BudgetTab } from "./budget-tab"
import { TripStory } from "./trip-story"
import type { MapStop } from "./itinerary-map"

type ApprovalStatus = "APPROVED" | "REJECTED" | "PENDING"

const displayName = (u: { name: string | null; email: string | null }) =>
  u.name ?? u.email?.split("@")[0] ?? "Member"

export default async function TripPage({ params }: PageProps<"/trips/[id]">) {
  const { id } = await params
  const user = await requireUser()

  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      members: {
        include: { user: true, preference: true },
        orderBy: { joinedAt: "asc" },
      },
      invites: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" } },
      prep: true,
      stayOptions: { orderBy: { createdAt: "asc" } },
    },
  })
  if (!trip) notFound()

  const myMember = trip.members.find((m) => m.userId === user.id)
  if (!myMember) notFound()

  const isAdmin = myMember.role === "ADMIN"
  const isVoter = myMember.role !== "OBSERVER"

  // First visit to a trip with no photo yet: find one after the page is sent.
  if (trip.coverImage === null) {
    after(() => resolveCovers([trip], 20_000))
  }

  // Everything below is independent of each other, so load it together.
  const [itinerary, expenses, settlements, polls, checklist, products, unreadCount] = await Promise.all([
    prisma.itinerary.findFirst({
      where: { tripId: id },
      orderBy: { generatedAt: "desc" },
      include: {
        days: {
          orderBy: { dayNumber: "asc" },
          include: { items: { orderBy: { order: "asc" } } },
        },
        approvals: true,
      },
    }),
    prisma.expense.findMany({
      where: { tripId: id },
      include: { shares: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.settlement.findMany({ where: { tripId: id } }),
    prisma.poll.findMany({
      where: { tripId: id },
      include: { votes: { select: { userId: true, option: true } } },
      orderBy: { createdAt: "desc" },
    }),
    loadChecklist(id, user.id, trip.prep),
    prisma.productSuggestion.findMany({
      where: { tripId: id },
      include: {
        suggestedBy: { select: { id: true, name: true, email: true, image: true } },
        votes: { select: { userId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ])

  // ── Approval state ────────────────────────────────────────────────
  const approvalOf = (userId: string): ApprovalStatus =>
    (itinerary?.approvals.find((a) => a.userId === userId)?.status ??
      "PENDING") as ApprovalStatus
  const planLocked = itinerary?.status === "FINAL"
  const myStatus = approvalOf(user.id)

  const approvers = trip.members
    .filter((m) => m.role !== "OBSERVER")
    .map((m) => ({
      userId: m.userId,
      name: m.user.name,
      image: m.user.image,
      email: m.user.email,
      status: approvalOf(m.userId),
      reason: itinerary?.approvals.find((a) => a.userId === m.userId)?.reason ?? null,
    }))

  // ── Located stops → numbered map pins ─────────────────────────────
  const stops: MapStop[] = []
  const stopNumbers: Record<string, number> = {}
  for (const day of itinerary?.days ?? []) {
    for (const it of day.items) {
      if (it.lat != null && it.lng != null) {
        const n = stops.length + 1
        stops.push({
          n,
          lat: it.lat,
          lng: it.lng,
          title: it.title,
          iconKey: activityIconKey(it.category, it.title, it.description),
        })
        stopNumbers[it.id] = n
      }
    }
  }
  const mapCenter = stops.length > 0 ? { lat: stops[0].lat, lng: stops[0].lng } : null

  // ── Budget (observers follow the trip but don't share its costs) ──
  const participants = trip.members
    .filter((m) => m.role !== "OBSERVER")
    .map((m) => ({ userId: m.userId, name: displayName(m.user) }))
  const names = Object.fromEntries(trip.members.map((m) => [m.userId, displayName(m.user)]))
  const balances = computeBalances(
    participants.map((p) => p.userId),
    expenses.map((e) => ({ amount: e.amount, paidById: e.paidById })),
    expenses.flatMap((e) => e.shares.map((s) => ({ userId: s.userId, amount: s.amount }))),
    settlements.map((s) => ({
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amount: s.amount,
    }))
  )
  const transfers = settleUp(balances)

  // ── Journey / hub ─────────────────────────────────────────────────
  const crew: HubMember[] = trip.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: displayName(m.user),
    image: m.user.image,
    role: m.role,
    hasPreference: !!m.preference,
    approval: approvalOf(m.userId),
    isMe: m.userId === user.id,
  }))

  const checklistDone = checklist.filter((c) => c.isDone).length
  const { steps, next } = computeJourney({
    viewerId: user.id,
    viewerRole: myMember.role,
    members: crew,
    pendingInvites: trip.invites.length,
    hasPlan: !!itinerary,
    planLocked,
    hasPrep: !!trip.prep,
    checklist: { done: checklistDone, total: checklist.length },
  })

  const phase = tripPhase(trip.startDate, trip.endDate)
  const days = tripDurationDays(trip.startDate, trip.endDate)

  const today = (() => {
    if (phase.phase !== "ongoing" || !itinerary || phase.dayNumber == null) return null
    const todayStart = startOfDay(new Date())
    const day =
      itinerary.days.find((d) => d.date && differenceInCalendarDays(d.date, todayStart) === 0) ??
      itinerary.days.find((d) => d.dayNumber === phase.dayNumber)
    if (!day) return null
    return {
      dayNumber: day.dayNumber,
      items: day.items.map((it) => ({
        id: it.id,
        time: it.startTime,
        title: it.title,
        place: it.placeName,
      })),
    }
  })()

  // ── Sidebar attention markers ─────────────────────────────────────
  const openPollsToVote = polls.filter(
    (p) => !(p.closesAt && p.closesAt <= new Date()) && !p.votes.some((v) => v.userId === user.id)
  ).length
  const badges: NavBadges = {}
  if (isVoter && !myMember.preference) badges.preferences = "dot"
  if (itinerary && !planLocked && isVoter && myStatus === "PENDING") badges.itinerary = "dot"
  if (isVoter && openPollsToVote > 0) badges.decisions = openPollsToVote
  // Crew picks this person hasn't weighed in on (and didn't suggest themselves).
  if (products.some((p) => !p.votes.some((v) => v.userId === user.id))) badges.gear = "dot"

  // ── Props for forms / sub-views ───────────────────────────────────
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
  const tripDefaults: CreateTripInput = {
    name: trip.name,
    destination: trip.destination,
    originCity: trip.originCity ?? "",
    startDate: trip.startDate.toISOString().slice(0, 10),
    endDate: trip.endDate.toISOString().slice(0, 10),
    tripType: trip.tripType,
    budgetPerPerson: trip.budgetPerPerson != null ? String(trip.budgetPerPerson) : "",
    currency: trip.currency as CreateTripInput["currency"],
  }

  const voters = crew.filter((m) => m.role !== "OBSERVER")
  const readiness = {
    filled: voters.filter((m) => m.hasPreference).length,
    total: voters.length,
    missing: voters.filter((m) => !m.hasPreference).map((m) => m.name.split(" ")[0]),
  }

  const pollData: PollData[] = polls.map((poll) => ({
    id: poll.id,
    question: poll.question,
    options: poll.options as unknown as string[],
    votes: poll.votes,
    closed: !!poll.closesAt && poll.closesAt <= new Date(),
    createdById: poll.createdById,
  }))

  const invite = {
    tripId: trip.id,
    tripName: trip.name,
    joinCode: trip.joinCode,
    isAdmin,
  }

  const facts = [
    { label: "Where", value: trip.destination },
    ...(trip.originCity ? [{ label: "From", value: trip.originCity }] : []),
    { label: "When", value: formatDateRange(trip.startDate, trip.endDate) },
    { label: "Length", value: `${days} ${days === 1 ? "day" : "days"}` },
    ...(trip.budgetPerPerson != null
      ? [{ label: "Budget", value: `${formatMoney(trip.budgetPerPerson, trip.currency)} / person` }]
      : []),
    { label: "Type", value: prettifyEnum(trip.tripType) },
  ]

  return (
    <TripTabs defaultTab="overview" allowed={allowedTabs(isAdmin)}>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <TripSidebarHeader
            name={trip.name}
            destination={trip.destination}
            coverImage={trip.coverImage || null}
            stagesDone={steps.filter((st) => st.state === "done").length}
            stagesTotal={steps.length}
          />

          <TripNav isAdmin={isAdmin} badges={badges} />

          <SidebarFooter>
            <NavUser user={{ name: user.name, email: user.email, image: user.image }} />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="min-w-0">
          <TripTopBar
            tripName={trip.name}
            isAdmin={isAdmin}
            unreadCount={unreadCount}
            actions={isVoter ? <InviteDialog {...invite} /> : null}
          />

          <div className="min-w-0 flex-1 px-4 pb-10 lg:px-6">
            <TabsPrimitive.Content value="overview">
              <TripHub
                steps={steps}
                next={next}
                phase={phase.phase}
                phaseChip={phaseLabel(trip.startDate, trip.endDate)}
                members={crew}
                hasPlan={!!itinerary}
                invite={invite}
                today={today}
                facts={facts}
              />
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="itinerary">
              <ItineraryTab
                tripId={trip.id}
                itinerary={itinerary}
                itineraryId={itinerary?.id ?? null}
                stops={stops}
                stopNumbers={stopNumbers}
                isAdmin={isAdmin}
                approval={{
                  locked: planLocked,
                  canApprove: isVoter,
                  myStatus,
                  approvers,
                }}
                readiness={readiness}
                viewerHasPreference={!!myMember.preference}
                viewerIsVoter={isVoter}
              />
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="stay">
              <TravelOptions
                tripId={trip.id}
                origin={trip.originCity ?? ""}
                destination={trip.destination}
                stays={trip.stayOptions}
                isAdmin={isAdmin}
                canVote={isVoter}
              />
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="gear">
              <GearTab
                tripId={trip.id}
                tripName={trip.name}
                currency={trip.currency}
                viewerId={user.id}
                isAdmin={isAdmin}
                members={trip.members.map((m) => ({
                  id: m.userId,
                  name: displayName(m.user),
                  image: m.user.image,
                }))}
                initialPicks={products.map(toPick)}
              />
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="preferences" className="max-w-3xl space-y-4 pt-5">
              <div>
                <h3 className="font-medium">My preferences</h3>
                <p className="text-sm text-muted-foreground">
                  These shape the plan for everyone. The more the group shares, the better
                  the itinerary. Only you can edit yours.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <PreferenceForm
                  tripId={trip.id}
                  defaultValues={prefDefaults}
                  firstTime={!myMember.preference}
                />
              </div>
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="decisions">
              <PollsPanel
                tripId={trip.id}
                polls={pollData}
                viewerId={user.id}
                viewerIsAdmin={isAdmin}
                canVote={isVoter}
                voterCount={voters.length}
                approval={{
                  hasPlan: !!itinerary,
                  locked: planLocked,
                  approved: approvers.filter((a) => a.status === "APPROVED").length,
                  total: approvers.length,
                  myStatus,
                }}
              />
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="members">
              <CrewTab
                tripId={trip.id}
                tripName={trip.name}
                joinCode={trip.joinCode}
                viewerId={user.id}
                viewerIsAdmin={isAdmin}
                members={trip.members.map((m) => ({
                  id: m.id,
                  userId: m.userId,
                  name: displayName(m.user),
                  email: m.user.email,
                  image: m.user.image,
                  role: m.role,
                  hasPreference: !!m.preference,
                }))}
                invites={trip.invites.map((i) => ({ id: i.id, email: i.email, role: i.role }))}
              />
            </TabsPrimitive.Content>

            {isAdmin && (
              <TabsPrimitive.Content value="insights" className="pt-5">
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

            {isAdmin && (
              <TabsPrimitive.Content value="settings">
                <SettingsTab
                  tripId={trip.id}
                  tripName={trip.name}
                  defaultValues={tripDefaults}
                  hasPlan={!!itinerary}
                />
              </TabsPrimitive.Content>
            )}

            <TabsPrimitive.Content value="prep">
              <PrepTab
                tripId={trip.id}
                prep={trip.prep}
                checklist={checklist.map((c) => ({
                  id: c.id,
                  label: c.label,
                  category: c.category,
                  isDone: c.isDone,
                }))}
                isAdmin={isAdmin}
                canDownload={!!trip.prep || !!itinerary}
              />
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="live" className="space-y-5 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">Live map</h3>
                  <p className="text-sm text-muted-foreground">
                    See the crew, drop meeting points and get a heads-up near saved spots.
                    Sharing is opt-in and stops on its own after 30 minutes of silence.
                  </p>
                </div>
                <TripModeControls />
              </div>
              <LiveMap tripId={trip.id} initialCenter={mapCenter} canEdit={isVoter} />
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="budget">
              <BudgetTab
                tripId={trip.id}
                currency={trip.currency}
                budgetPerPerson={trip.budgetPerPerson}
                viewerId={user.id}
                viewerIsAdmin={isAdmin}
                viewerIsObserver={!isVoter}
                participants={participants}
                names={names}
                expenses={expenses.map((e) => ({
                  id: e.id,
                  description: e.description,
                  amount: e.amount,
                  category: e.category,
                  paidById: e.paidById,
                  createdById: e.createdById,
                  splitType: e.splitType,
                  shareCount: e.shares.length,
                  createdAt: e.createdAt,
                }))}
                transfers={transfers}
                myBalance={balances[user.id] ?? 0}
              />
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="story" className="space-y-5 pt-5">
              <div>
                <h3 className="font-medium">Visual story</h3>
                <p className="text-sm text-muted-foreground">
                  A cinematic fly-through of your trip: 3D map, photos of each place, and
                  a voice-over.
                </p>
              </div>
              {itinerary ? (
                <TripStory tripId={trip.id} />
              ) : (
                <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center">
                  <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-brand">
                    <Clapperboard className="size-7" />
                  </div>
                  <h3 className="text-lg font-semibold">No story yet</h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Generate an itinerary first. The story is built from your located stops.
                  </p>
                </div>
              )}
            </TabsPrimitive.Content>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TripTabs>
  )
}

/**
 * This member's personal checklist. On first view it's seeded from the prep
 * guide's documents and packing list, so it appears without any extra step.
 */
async function loadChecklist(
  tripId: string,
  userId: string,
  prep: { documents: unknown; packing: unknown } | null
) {
  if (prep) {
    const existing = await prisma.checklistItem.count({ where: { tripId, userId } })
    if (existing === 0) {
      const docs = ((prep.documents as string[]) ?? []).map((label, i) => ({
        tripId,
        userId,
        label,
        category: "DOCUMENT" as const,
        order: i,
      }))
      const packing = ((prep.packing as { category: string; items: string[] }[]) ?? []).flatMap(
        (c, ci) =>
          c.items.map((label, ii) => ({
            tripId,
            userId,
            label,
            category: "PACKING" as const,
            order: 100 + ci * 20 + ii,
          }))
      )
      const seed = [...docs, ...packing]
      if (seed.length > 0) await prisma.checklistItem.createMany({ data: seed })
    }
  }
  return prisma.checklistItem.findMany({
    where: { tripId, userId },
    orderBy: { order: "asc" },
  })
}
