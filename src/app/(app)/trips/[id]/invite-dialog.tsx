"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, Copy, Loader2, RefreshCw, Share2, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { inviteMember, regenerateJoinCode } from "@/server/trips"
import { inviteSchema, ROLES, type InviteInput } from "@/lib/validators"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** WhatsApp glyph (Lucide has no brand icons). */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2a9.93 9.93 0 0 0-8.5 15.06L2 22l5.07-1.5A9.94 9.94 0 1 0 12.04 2Zm0 18.15a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3 .88.9-2.92-.2-.31a8.2 8.2 0 1 1 6.78 3.67Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.22-.09-.39-.12-.55.12-.17.25-.63.8-.77.96-.14.17-.28.19-.53.06a6.7 6.7 0 0 1-1.97-1.22 7.4 7.4 0 0 1-1.36-1.69c-.14-.25-.02-.38.1-.5.11-.11.25-.28.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.57.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.17-.47-.29Z" />
    </svg>
  )
}

export function InviteDialog({
  tripId,
  tripName,
  joinCode,
  isAdmin,
  trigger,
  compact = false,
}: {
  tripId: string
  tripName: string
  joinCode: string
  isAdmin: boolean
  trigger?: React.ReactNode
  /** Icon only on phones, where the top bar is short of room. */
  compact?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [resetting, startReset] = React.useTransition()
  const [copied, setCopied] = React.useState(false)
  // The share URL needs the browser's origin, which the server can't know.
  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  )

  const link = `${origin}/join/${joinCode}`
  const message = `Join me on "${tripName}" on Trippo. Tell us how you like to travel and help shape the plan: ${link}`

  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "MEMBER" },
  })

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success("Invite link copied")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.")
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: tripName, text: message })
    } catch {
      /* user dismissed the share sheet */
    }
  }

  function resetLink() {
    startReset(async () => {
      const res = await regenerateJoinCode(tripId)
      if (res.ok) toast.success("New invite link created. The old one no longer works.")
      else toast.error(res.error)
    })
  }

  function onSubmit(values: InviteInput) {
    startTransition(async () => {
      const res = await inviteMember(tripId, values)
      if (res.ok) {
        toast.success(
          res.added
            ? "Added to the trip"
            : "Saved. They'll join automatically when they sign in with that email."
        )
        form.reset({ email: "", role: "MEMBER" })
      } else {
        toast.error(res.error)
      }
    })
  }

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1.5" aria-label="Invite">
            <UserPlus className="size-4" />
            <span className={compact ? "hidden sm:inline" : undefined}>Invite</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite your crew</DialogTitle>
          <DialogDescription>
            Send this link in your group chat. Anyone who opens it can sign in and
            join as a member.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
            <Button variant="outline" onClick={copy} className="shrink-0 gap-1.5">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <WhatsAppIcon className="size-4 text-emerald-600" />
                WhatsApp
              </a>
            </Button>
            {canNativeShare && (
              <Button variant="outline" size="sm" onClick={nativeShare} className="gap-1.5">
                <Share2 className="size-4" />
                More…
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetLink}
                disabled={resetting}
                className="ml-auto gap-1.5 text-muted-foreground"
              >
                <RefreshCw className={`size-4 ${resetting ? "animate-spin" : ""}`} />
                Reset link
              </Button>
            )}
          </div>
        </div>

        {isAdmin && (
          <>
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or add by email</span>
              <Separator className="flex-1" />
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="friend@gmail.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Role</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full sm:w-32">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Trippo doesn&apos;t send emails. They&apos;re added the moment they
                  sign in with this address, so share the link too.
                </p>
                <DialogFooter>
                  <Button type="submit" variant="secondary" disabled={pending} className="gap-2">
                    {pending && <Loader2 className="size-4 animate-spin" />}
                    Add by email
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
