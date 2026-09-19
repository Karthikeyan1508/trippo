import { CheckCircle2, XCircle, Clock, Lock } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress-lite"
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
  { icon: React.ComponentType<{ className?: string }>; label: string; className: string }
> = {
  APPROVED: {
    icon: CheckCircle2,
    label: "Approved",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  REJECTED: {
    icon: XCircle,
    label: "Changes requested",
    className: "text-destructive",
  },
  PENDING: {
    icon: Clock,
    label: "Pending",
    className: "text-muted-foreground",
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
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Group approval</h3>
        {locked ? (
          <Badge className="gap-1.5">
            <Lock className="size-3.5" />
            Locked
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">
            {approved} / {total} approved
          </span>
        )}
      </div>

      {locked ? (
        <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
          Everyone&apos;s approved — the plan is confirmed and locked in. 🎉
        </p>
      ) : (
        <Progress value={pct} className="mt-3" />
      )}

      <ul className="mt-4 divide-y">
        {approvers.map((a) => {
          const meta = STATUS_META[a.status]
          const Icon = meta.icon
          return (
            <li key={a.userId} className="flex items-start gap-3 py-3">
              <Avatar className="size-8">
                <AvatarImage src={a.image ?? undefined} alt={a.name ?? ""} />
                <AvatarFallback>{initials(a.name, a.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {a.name ?? a.email}
                </p>
                {a.reason && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    “{a.reason}”
                  </p>
                )}
              </div>
              <span
                className={`flex shrink-0 items-center gap-1.5 text-xs ${meta.className}`}
              >
                <Icon className="size-4" />
                {meta.label}
              </span>
            </li>
          )
        })}
      </ul>

      {canApprove ? (
        <div className="mt-4 border-t pt-4">
          <ApprovalControls itineraryId={itineraryId} myStatus={myStatus} />
        </div>
      ) : (
        <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
          You&apos;re an observer — you can view the plan but not vote.
        </p>
      )}
    </div>
  )
}
