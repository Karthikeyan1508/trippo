import { differenceInCalendarDays, startOfDay } from "date-fns"

/**
 * The Trip Hub's brain: turns the trip's real state into
 *  1. a five-stage journey (invite → preferences → plan → approval → prep), and
 *  2. ONE recommended next action tailored to the person looking at it.
 *
 * Pure and framework-free so it is easy to reason about and test.
 */

export type Role = "ADMIN" | "MEMBER" | "OBSERVER"
export type ApprovalState = "APPROVED" | "REJECTED" | "PENDING"

export type JourneyInput = {
  viewerId: string
  viewerRole: Role
  members: {
    userId: string
    name: string
    role: Role
    hasPreference: boolean
    approval: ApprovalState
  }[]
  pendingInvites: number
  hasPlan: boolean
  planLocked: boolean
  hasPrep: boolean
  checklist: { done: number; total: number }
}

export type StepKey = "crew" | "preferences" | "plan" | "approval" | "prep"

export type JourneyStep = {
  key: StepKey
  title: string
  detail: string
  state: "done" | "current" | "todo"
  /** Sidebar section that owns this stage. */
  tab: string
}

export type NextAction = {
  tone: "action" | "waiting" | "done"
  eyebrow: string
  title: string
  body: string
  cta?: { label: string; tab: string } | { label: string; invite: true }
  secondary?: { label: string; tab: string }
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

function names(list: { name: string }[], max = 3) {
  const first = list.slice(0, max).map((m) => m.name.split(" ")[0])
  const rest = list.length - first.length
  return rest > 0 ? `${first.join(", ")} +${rest}` : first.join(", ")
}

export function computeJourney(input: JourneyInput) {
  const { viewerId, viewerRole, members, pendingInvites } = input
  const voters = members.filter((m) => m.role !== "OBSERVER")
  const viewer = members.find((m) => m.userId === viewerId)
  const isAdmin = viewerRole === "ADMIN"
  const isVoter = viewerRole !== "OBSERVER"

  const withPrefs = voters.filter((m) => m.hasPreference)
  const missingPrefs = voters.filter((m) => !m.hasPreference)
  const approved = voters.filter((m) => m.approval === "APPROVED")
  const wantChanges = voters.filter((m) => m.approval === "REJECTED")
  const notVoted = voters.filter((m) => m.approval === "PENDING")

  // ── The five stages ────────────────────────────────────────────────
  const done: Record<StepKey, boolean> = {
    crew: voters.length >= 2,
    preferences: voters.length > 0 && missingPrefs.length === 0,
    plan: input.hasPlan,
    approval: input.planLocked,
    prep: input.hasPrep,
  }

  const details: Record<StepKey, string> = {
    crew:
      voters.length >= 2
        ? `${plural(members.length, "person", "people")} going`
        : pendingInvites > 0
          ? `${plural(pendingInvites, "invite")} pending`
          : "Just you so far",
    preferences: `${withPrefs.length}/${voters.length} shared`,
    plan: input.hasPlan ? "Plan ready" : "Not built yet",
    approval: input.hasPlan
      ? input.planLocked
        ? "Locked in"
        : `${approved.length}/${voters.length} approved`
      : "After the plan",
    prep: input.hasPrep
      ? input.checklist.total > 0
        ? `${input.checklist.done}/${input.checklist.total} packed`
        : "Guide ready"
      : "Not started",
  }

  const titles: Record<StepKey, string> = {
    crew: "Invite your crew",
    preferences: "Share preferences",
    plan: "Build the plan",
    approval: "Approve together",
    prep: "Get ready",
  }
  const tabs: Record<StepKey, string> = {
    crew: "members",
    preferences: "preferences",
    plan: "itinerary",
    approval: "itinerary",
    prep: "prep",
  }

  const order: StepKey[] = ["crew", "preferences", "plan", "approval", "prep"]
  const currentKey = order.find((k) => !done[k])
  const steps: JourneyStep[] = order.map((key) => ({
    key,
    title: titles[key],
    detail: details[key],
    tab: tabs[key],
    state: done[key] ? "done" : key === currentKey ? "current" : "todo",
  }))

  // ── The viewer's single most useful next action ────────────────────
  const next = ((): NextAction => {
    // 1. Everyone's own preferences come first — they shape the whole plan.
    if (isVoter && viewer && !viewer.hasPreference && !input.planLocked) {
      return {
        tone: "action",
        eyebrow: "Your move",
        title: "Tell us how you like to travel",
        body: "Diet, pace, budget and interests — it takes about two minutes and shapes the itinerary for everyone.",
        cta: { label: "Add my preferences", tab: "preferences" },
      }
    }

    // 2. Admin with an empty crew.
    if (isAdmin && voters.length < 2 && !input.hasPlan) {
      return {
        tone: "action",
        eyebrow: "Next step",
        title: "Bring your crew in",
        body:
          pendingInvites > 0
            ? `${plural(pendingInvites, "email invite")} waiting. Share the link too — it's the fastest way to get everyone in.`
            : "Share the invite link in your group chat. Everyone fills in their preferences before the plan is built.",
        cta: { label: "Invite people", invite: true },
      }
    }

    // 3. No plan yet.
    if (!input.hasPlan) {
      if (isAdmin) {
        if (missingPrefs.length === 0) {
          return {
            tone: "action",
            eyebrow: "Next step",
            title: "Everyone's in — build the plan",
            body: "All preferences are collected. Trippo researches real places and balances them into a day-by-day itinerary.",
            cta: { label: "Generate the plan", tab: "itinerary" },
          }
        }
        return {
          tone: "action",
          eyebrow: "Next step",
          title: `Waiting on ${names(missingPrefs)}`,
          body: `${withPrefs.length} of ${voters.length} have shared preferences. Plans are fairer when everyone answers — but you can generate now and regenerate later.`,
          cta: { label: "Generate anyway", tab: "itinerary" },
          secondary: { label: "Invite people", tab: "members" },
        }
      }
      return {
        tone: "waiting",
        eyebrow: "Hang tight",
        title: "The plan is being prepared",
        body:
          missingPrefs.length > 0
            ? `Waiting on ${names(missingPrefs)} to share preferences, then the admin builds the itinerary.`
            : "Everyone has shared preferences. The admin will generate the itinerary next.",
      }
    }

    // 4. Plan exists but is not locked yet.
    if (!input.planLocked) {
      if (isVoter && viewer?.approval === "PENDING") {
        return {
          tone: "action",
          eyebrow: "Your vote",
          title: "Review the plan and vote",
          body: `${approved.length} of ${voters.length} have approved. Approve it, or ask for changes with a reason.`,
          cta: { label: "Review the plan", tab: "itinerary" },
        }
      }
      if (isAdmin && wantChanges.length > 0) {
        return {
          tone: "action",
          eyebrow: "Feedback",
          title: `${names(wantChanges)} asked for changes`,
          body: "Read their notes, then edit the stops or regenerate the plan. Edits reset everyone's vote.",
          cta: { label: "See feedback", tab: "itinerary" },
        }
      }
      if (isVoter && viewer?.approval === "APPROVED") {
        return {
          tone: "waiting",
          eyebrow: "You're in",
          title: notVoted.length > 0 ? `Waiting on ${names(notVoted)}` : "Waiting on the group",
          body: `${approved.length} of ${voters.length} approved. The plan locks automatically when everyone agrees.`,
          secondary: { label: "View the plan", tab: "itinerary" },
        }
      }
      return {
        tone: "waiting",
        eyebrow: "In review",
        title: "The group is voting on the plan",
        body: `${approved.length} of ${voters.length} approved so far.`,
        secondary: { label: "View the plan", tab: "itinerary" },
      }
    }

    // 5. Locked: prep and packing.
    if (!input.hasPrep) {
      return isAdmin
        ? {
            tone: "action",
            eyebrow: "Plan locked",
            title: "Generate the prep guide",
            body: "Local etiquette, useful phrases and a packing checklist tailored to where you're going.",
            cta: { label: "Create prep guide", tab: "prep" },
          }
        : {
            tone: "waiting",
            eyebrow: "Plan locked",
            title: "The prep guide is coming",
            body: "The admin will add etiquette tips and a packing list shortly.",
          }
    }
    if (input.checklist.total > 0 && input.checklist.done < input.checklist.total) {
      return {
        tone: "action",
        eyebrow: "Get ready",
        title: `${input.checklist.total - input.checklist.done} items left to pack`,
        body: "Tick things off your personal checklist as you go — it's just for you.",
        cta: { label: "Open my checklist", tab: "prep" },
      }
    }
    return {
      tone: "done",
      eyebrow: "All set",
      title: "You're ready to go",
      body: "The plan is locked and your list is done. Share your live location on the day, and log expenses as you spend.",
      cta: { label: "Open live map", tab: "live" },
      secondary: { label: "Add an expense", tab: "budget" },
    }
  })()

  return { steps, next, voters, currentKey }
}

// ── Calendar phase ──────────────────────────────────────────────────────

export type TripPhase = "upcoming" | "ongoing" | "past"

/** Where "today" sits relative to the trip dates. */
export function tripPhase(start: Date, end: Date, now = new Date()) {
  const today = startOfDay(now)
  const daysToStart = differenceInCalendarDays(start, today)
  const daysSinceEnd = differenceInCalendarDays(today, end)
  const phase: TripPhase =
    daysToStart > 0 ? "upcoming" : daysSinceEnd > 0 ? "past" : "ongoing"
  return {
    phase,
    daysToStart,
    /** 1-based day of the trip while ongoing. */
    dayNumber: phase === "ongoing" ? -daysToStart + 1 : null,
  }
}

/** Human label for the countdown chip ("in 12 days", "Day 2", "ended"). */
export function phaseLabel(start: Date, end: Date, now = new Date()) {
  const p = tripPhase(start, end, now)
  if (p.phase === "upcoming") {
    if (p.daysToStart === 1) return "Tomorrow"
    return `In ${p.daysToStart} days`
  }
  if (p.phase === "ongoing") return `Day ${p.dayNumber} of the trip`
  return "Trip ended"
}

// ── Dashboard: one-line "what do you need to do on this trip?" ──────────

export type AttentionInput = {
  viewerId: string
  members: { userId: string; role: Role; hasPreference: boolean }[]
  plan: {
    locked: boolean
    approvals: { userId: string; status: ApprovalState }[]
  } | null
}

/**
 * The single most useful nudge for this person on a trip card, or null when
 * nothing needs them. Mirrors the Hub's logic in a cheap, list-friendly form.
 */
export function tripAttention({ viewerId, members, plan }: AttentionInput) {
  const viewer = members.find((m) => m.userId === viewerId)
  if (!viewer || viewer.role === "OBSERVER") return null
  if (!viewer.hasPreference && !plan?.locked) return "Add your preferences"

  if (!plan) {
    const waiting = members.filter((m) => m.role !== "OBSERVER" && !m.hasPreference)
    if (viewer.role === "ADMIN") {
      return waiting.length === 0 ? "Ready to generate the plan" : null
    }
    return null
  }
  if (!plan.locked) {
    const mine = plan.approvals.find((a) => a.userId === viewerId)?.status ?? "PENDING"
    if (mine === "PENDING") return "Vote on the plan"
  }
  return null
}
