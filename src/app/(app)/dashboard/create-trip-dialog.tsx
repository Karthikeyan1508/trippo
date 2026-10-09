"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { createTrip } from "@/server/trips"
import { createTripSchema, type CreateTripInput } from "@/lib/validators"
import { TripFormFields } from "@/components/trip-form-fields"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function CreateTripDialog({
  trigger,
}: {
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const form = useForm<CreateTripInput>({
    resolver: zodResolver(createTripSchema),
    defaultValues: {
      name: "",
      destination: "",
      originCity: "",
      startDate: "",
      endDate: "",
      tripType: "LEISURE",
      budgetPerPerson: "",
      currency: "INR",
    },
  })

  function onSubmit(values: CreateTripInput) {
    startTransition(async () => {
      const res = await createTrip(values)
      if (res && res.ok === false) {
        toast.error(res.error)
      }
      // On success the server action redirects to the new trip page.
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-2">
            <Plus className="size-4" />
            New trip
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a trip</DialogTitle>
          <DialogDescription>
            Just the basics — next you&apos;ll invite your crew and everyone
            shares how they like to travel.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <TripFormFields form={form} />
            <DialogFooter>
              <Button type="submit" disabled={pending} className="gap-2">
                {pending && <Loader2 className="size-4 animate-spin" />}
                Create trip
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
