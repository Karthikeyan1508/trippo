import { Check, CircleDashed, Crown, Eye } from "lucide-react"

import { prettifyEnum } from "@/lib/format"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { InviteDialog } from "./invite-dialog"
import { MemberActions } from "./member-actions"
import { RevokeInviteButton } from "./revoke-invite-button"

export type CrewMember = {
  id: string
  userId: string
  name: string
  email: string | null
  image: string | null
  role: "ADMIN" | "MEMBER" | "OBSERVER"
  hasPreference: boolean
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function CrewTab({
  tripId,
  tripName,
  joinCode,
  viewerId,
  viewerIsAdmin,
  members,
  invites,
}: {
  tripId: string
  tripName: string
  joinCode: string
  viewerId: string
  viewerIsAdmin: boolean
  members: CrewMember[]
  invites: { id: string; email: string; role: string }[]
}) {
  return (
    <div className="space-y-5 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">The crew</h3>
          <p className="text-sm text-muted-foreground">
            Admins run the trip, members vote and contribute, observers follow along.
          </p>
        </div>
        <InviteDialog
          tripId={tripId}
          tripName={tripName}
          joinCode={joinCode}
          isAdmin={viewerIsAdmin}
        />
      </div>

      <div className="rounded-xl border bg-card">
        <ul className="divide-y">
          {members.map((m) => {
            const isSelf = m.userId === viewerId
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar className="size-10">
                  <AvatarImage src={m.image ?? undefined} alt={m.name} />
                  <AvatarFallback>{initials(m.name)}</AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 basis-40">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {m.name}
                    {isSelf && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                </div>

                {m.role !== "OBSERVER" &&
                  (m.hasPreference ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <Check className="size-4" />
                      Preferences in
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CircleDashed className="size-4" />
                      No preferences yet
                    </span>
                  ))}

                {!viewerIsAdmin && (
                  <Badge variant={m.role === "ADMIN" ? "default" : "outline"} className="gap-1">
                    {m.role === "ADMIN" && <Crown className="size-3" />}
                    {m.role === "OBSERVER" && <Eye className="size-3" />}
                    {prettifyEnum(m.role)}
                  </Badge>
                )}

                <MemberActions
                  tripId={tripId}
                  memberId={m.id}
                  name={m.name}
                  role={m.role}
                  isSelf={isSelf}
                  viewerIsAdmin={viewerIsAdmin}
                />
              </li>
            )
          })}
        </ul>
      </div>

      {invites.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-5 py-3">
            <h3 className="font-medium">Waiting to join</h3>
            <p className="text-xs text-muted-foreground">
              They&apos;re added automatically when they sign in with this email.
            </p>
          </div>
          <ul className="divide-y">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited as {prettifyEnum(inv.role)}
                  </p>
                </div>
                <Badge variant="secondary">Pending</Badge>
                {viewerIsAdmin && <RevokeInviteButton tripId={tripId} inviteId={inv.id} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
