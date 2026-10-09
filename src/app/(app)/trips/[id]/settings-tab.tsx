"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { deleteTrip, updateTrip } from "@/server/trips"
import { createTripSchema, type CreateTripInput } from "@/lib/validators"
import { TripFormFields } from "@/components/trip-form-fields"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

/** Admin-only: edit the trip's basics, or delete it. */
export function SettingsTab({
  tripId,
  tripName,
  defaultValues,
  hasPlan,
}: {
  tripId: string
  tripName: string
  defaultValues: CreateTripInput
  hasPlan: boolean
}) {
  const [saving, startSaving] = React.useTransition()
  const [deleting, startDeleting] = React.useTransition()

  const form = useForm<CreateTripInput>({
    resolver: zodResolver(createTripSchema),
    defaultValues,
  })

  const [startDate, endDate, destination] = useWatch({
    control: form.control,
    name: ["startDate", "endDate", "destination"],
  })
  const datesChanged =
    hasPlan &&
    (startDate !== defaultValues.startDate ||
      endDate !== defaultValues.endDate ||
      destination !== defaultValues.destination)

  function save(values: CreateTripInput) {
    startSaving(async () => {
      const res = await updateTrip(tripId, values)
      if (res.ok) {
        toast.success("Trip details saved")
        form.reset(values)
      } else {
        toast.error(res.error)
      }
    })
  }

  function remove() {
    startDeleting(async () => {
      const res = await deleteTrip(tripId)
      // On success the action redirects to the dashboard.
      if (res && !res.ok) toast.error(res.error)
    })
  }

  return (
    <div className="max-w-2xl space-y-6 pt-5">
      <div>
        <h3 className="font-medium">Trip settings</h3>
        <p className="text-sm text-muted-foreground">
          Only admins can see and change these.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(save)} className="space-y-4">
            <TripFormFields form={form} />

            {datesChanged && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                The destination or dates changed, so the current plan may be out of
                date — regenerate it from the Itinerary tab.
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving || !form.formState.isDirty} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save changes
              </Button>
              {form.formState.isDirty && !saving && (
                <span className="text-sm text-muted-foreground">Unsaved changes</span>
              )}
            </div>
          </form>
        </Form>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <h4 className="font-medium text-destructive">Danger zone</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleting the trip removes the plan, expenses, polls and everyone&apos;s
          checklists for the whole group. This can&apos;t be undone.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-4 gap-2" disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete trip
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{tripName}”?</AlertDialogTitle>
              <AlertDialogDescription>
                Everyone loses access and all of the trip&apos;s data is permanently
                deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep trip</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={remove}>
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
