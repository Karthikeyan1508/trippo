import { CheckCircle2, XCircle, Clock, Lock, PartyPopper, Users } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ApprovalControls } from "./approval-controls"

type ApprovalStatus = "APPROVED" | "REJECTED" | "PENDING"

type Approver = {
  userId: string
  name: string | null
  image: string | null
  email: string | null
  status: ApprovalStatus
  reason: string | null
}

function initials(name?: string | null, email?: string | null) {
  const s = name || email || "?"
  return s
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

const STATUS_META: Record<
  ApprovalStatus,
  {
    icon: React.ComponentType<{ className?: string }>
    label: string
    pill: string
    ring: string
  }
> = {
  APPROVED: {
    icon: CheckCircle2,
    label: "Approved",
    pill: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/50",
  },
  REJECTED: {
    icon: XCircle,
    label: "Changes requested",
    pill: "border-destructive/20 bg-destructive/10 text-destructive",
    ring: "ring-destructive/50",
  },
  PENDING: {
    icon: Clock,
    label: "Pending",
    pill: "border-transparent bg-muted text-muted-foreground",
    ring: "ring-border",
  },
}

export function ApprovalPanel({
  itineraryId,
  locked,
  canApprove,
  myStatus,
  approvers,
}: {
  itineraryId: string
  locked: boolean
  canApprove: boolean
  myStatus: ApprovalStatus
  approvers: Approver[]
}) {
  const total = approvers.length
  const approved = approvers.filter((a) => a.status === "APPROVED").length
  const changes = approvers.filter((a) => a.status === "REJECTED").length
  const pendingCount = total - approved - changes
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand">
            <Users className="size-5" />
          </div>
          <div>
            <h3 className="leading-tight font-semibold">Group approval</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {locked
                ? "Confirmed by everyone"
                : [
                    `${approved} approved`,
                    changes > 0 ? `${changes} want changes` : null,
                    pendingCount > 0 ? `${pendingCount} pending` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
          </div>
        </div>

        {locked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Lock className="size-3.5" />
            Locked
          </span>
        ) : (
          <div
            className="grid size-12 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--muted) 0deg)`,
            }}
          >
            <div className="grid size-9 place-items-center rounded-full bg-card text-xs font-semibold tabular-nums">
              {pct}%
            </div>
          </div>
        )}
      </div>

      {locked && (
        <div className="flex items-center gap-2 border-b bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <PartyPopper className="size-4 shrink-0" />
          The plan is confirmed and locked in.
        </div>
      )}

      {/* Approvers */}
      <ul className="divide-y">
        {approvers.map((a) => {
          const meta = STATUS_META[a.status]
          const Icon = meta.icon
          return (
            <li key={a.userId} className="flex items-center gap-3 px-5 py-3">
              <Avatar
                className={`size-9 shrink-0 ring-2 ring-offset-2 ring-offset-card ${meta.ring}`}
              >
                <AvatarImage src={a.image ?? undefined} alt={a.name ?? ""} />
                <AvatarFallback>{initials(a.name, a.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {a.name ?? a.email}
                </p>
                {a.reason && (
                  <p className="truncate text-xs text-muted-foreground">
                    “{a.reason}”
                  </p>
                )}
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.pill}`}
              >
                <Icon className="size-3.5" />
                {meta.label}
              </span>
            </li>
          )
        })}
      </ul>

      {/* Footer / actions */}
      <div className="border-t bg-muted/20 px-5 py-4">
        {locked ? (
          <p className="text-center text-sm text-muted-foreground">
            No further votes needed. You&apos;re all set.
          </p>
        ) : canApprove ? (
          <ApprovalControls itineraryId={itineraryId} myStatus={myStatus} />
        ) : (
          <p className="text-sm text-muted-foreground">
            You&apos;re an observer. You can view the plan but not vote.
          </p>
        )}
      </div>
    </div>
  )
}
