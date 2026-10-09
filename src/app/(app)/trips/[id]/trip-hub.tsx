import {
  ArrowRight,
  Check,
  CircleDashed,
  Clock,
  Crown,
  Eye,
  Hourglass,
  PartyPopper,
  Sparkles,
  UserPlus,
} from "lucide-react"

import { cn } from "cn"
import type { JourneyStep, NextAction, TripPhase } from "@/lib/journey"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InviteDialog } from "./invite-dialog"
import { TabLink } from "./trip-tabs"

export type HubMember = {
  id: string
  userId: string
  name: string
  image: string | null
  role: "ADMIN" | "MEMBER" | "OBSERVER"
  hasPreference: boolean
  approval: "APPROVED" | "REJECTED" | "PENDING"
  isMe: boolean
}

export type HubTodayItem = {
  id: string
  time: string | null
  title: string
  place: string | null
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

const TONE_STYLES = {
  action: {
    card: "border-primary/25 bg-primary/5",
    icon: "bg-primary text-primary-foreground",
    Icon: Sparkles,
  },
  waiting: {
    card: "bg-muted/40",
    icon: "bg-muted text-muted-foreground",
    Icon: Hourglass,
  },
  done: {
    card: "border-emerald-500/25 bg-emerald-500/5",
    icon: "bg-emerald-500 text-white",
    Icon: PartyPopper,
  },
} as const

function NextStepCard({
  next,
  phaseChip,
  invite,
}: {
  next: NextAction
  phaseChip: string
  invite: React.ComponentProps<typeof InviteDialog>
}) {
  const tone = TONE_STYLES[next.tone]
  const cta = next.cta

  return (
    <section className={cn("rounded-2xl border p-5 sm:p-6", tone.card)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tone.icon)}>
            <tone.Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {next.eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              {next.title}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
              {next.body}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="hidden shrink-0 gap-1.5 bg-card py-1 sm:inline-flex">
          <Clock className="size-3" />
          {phaseChip}
        </Badge>
      </div>

      {(cta || next.secondary) && (
        <div className="mt-5 flex flex-wrap items-center gap-2 sm:pl-15">
          {cta && "invite" in cta && (
            <InviteDialog
              {...invite}
              trigger={
                <Button size="lg" className="gap-2">
                  <UserPlus className="size-4" />
                  {cta.label}
                </Button>
              }
            />
          )}
          {cta && "tab" in cta && (
            <Button asChild size="lg" className="gap-2">
              <TabLink tab={cta.tab}>
                {cta.label}
                <ArrowRight className="size-4" />
              </TabLink>
            </Button>
          )}
          {next.secondary && (
            <Button asChild size="lg" variant="ghost">
              <TabLink tab={next.secondary.tab}>{next.secondary.label}</TabLink>
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

function Stepper({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map((step, i) => (
        <li key={step.key}>
          <TabLink
            tab={step.tab}
            className={cn(
              "group flex h-full items-start gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5 lg:flex-col lg:gap-2.5",
              step.state === "current" && "border-primary/50 ring-1 ring-primary/20"
            )}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                step.state === "done" && "bg-emerald-500 text-white",
                step.state === "current" && "bg-primary text-primary-foreground",
                step.state === "todo" && "bg-muted text-muted-foreground"
              )}
            >
              {step.state === "done" ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm leading-tight font-medium">{step.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{step.detail}</span>
            </span>
          </TabLink>
        </li>
      ))}
    </ol>
  )
}

function CrewCard({
  members,
  hasPlan,
  invite,
}: {
  members: HubMember[]
  hasPlan: boolean
  invite: React.ComponentProps<typeof InviteDialog>
}) {
  return (
    <section className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <div>
          <h3 className="font-medium">The crew</h3>
          <p className="text-xs text-muted-foreground">
            {members.length} {members.length === 1 ? "person" : "people"} · who&apos;s ready
          </p>
        </div>
        <InviteDialog
          {...invite}
          trigger={
            <Button size="sm" variant="outline" className="gap-1.5">
              <UserPlus className="size-4" />
              Invite
            </Button>
          }
        />
      </div>

      <ul className="divide-y">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-5 py-3">
            <Avatar className="size-9">
              <AvatarImage src={m.image ?? undefined} alt={m.name} />
              <AvatarFallback>{initials(m.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                {m.name}
                {m.isMe && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                {m.role === "ADMIN" && <Crown className="size-3.5 text-amber-500" aria-label="Admin" />}
                {m.role === "OBSERVER" && <Eye className="size-3.5 text-muted-foreground" aria-label="Observer" />}
              </p>
              <p className="text-xs text-muted-foreground">
                {m.role === "OBSERVER"
                  ? "Observer, follows along"
                  : m.hasPreference
                    ? "Preferences shared"
                    : "Hasn't shared preferences yet"}
              </p>
            </div>

            {m.role !== "OBSERVER" && (
              <div className="flex shrink-0 items-center gap-1.5">
                {hasPlan && m.approval === "APPROVED" && (
                  <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" />
                    Approved
                  </Badge>
                )}
                {hasPlan && m.approval === "REJECTED" && (
                  <Badge variant="outline" className="border-destructive/30 text-destructive">
                    Wants changes
                  </Badge>
                )}
                {!m.hasPreference && !hasPlan && <CircleDashed className="size-4 text-muted-foreground" aria-hidden />}
                {m.hasPreference && !hasPlan && <Check className="size-4 text-emerald-500" aria-hidden />}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function TodayCard({ dayNumber, items }: { dayNumber: number; items: HubTodayItem[] }) {
  return (
    <section className="rounded-2xl border bg-card">
      <div className="border-b px-5 py-3.5">
        <h3 className="font-medium">Today · Day {dayNumber}</h3>
        <p className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "stop" : "stops"} planned
        </p>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Nothing is planned for today.
        </p>
      ) : (
        <ol className="divide-y">
          {items.map((it) => (
            <li key={it.id} className="flex gap-3 px-5 py-3">
              <span className="w-12 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                {it.time ?? "Flexible"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{it.title}</p>
                {it.place && it.place !== it.title && (
                  <p className="truncate text-xs text-muted-foreground">{it.place}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="border-t px-5 py-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <TabLink tab="live">
            Open live map
            <ArrowRight className="size-4" />
          </TabLink>
        </Button>
      </div>
    </section>
  )
}

export function TripHub({
  steps,
  next,
  phase,
  phaseChip,
  members,
  hasPlan,
  invite,
  today,
  facts,
}: {
  steps: JourneyStep[]
  next: NextAction
  phase: TripPhase
  phaseChip: string
  members: HubMember[]
  hasPlan: boolean
  invite: React.ComponentProps<typeof InviteDialog>
  today: { dayNumber: number; items: HubTodayItem[] } | null
  facts: { label: string; value: string }[]
}) {
  return (
    <div className="space-y-5 pt-5">
      <NextStepCard next={next} phaseChip={phaseChip} invite={invite} />

      <Stepper steps={steps} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <CrewCard members={members} hasPlan={hasPlan} invite={invite} />

        <div className="space-y-5">
          {phase === "ongoing" && today && (
            <TodayCard dayNumber={today.dayNumber} items={today.items} />
          )}
          <section className="rounded-2xl border bg-card p-5">
            <h3 className="font-medium">Trip snapshot</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              {facts.map((f) => (
                <div key={f.label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="text-right font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
