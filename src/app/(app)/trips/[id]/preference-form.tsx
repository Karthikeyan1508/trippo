"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Check } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { savePreference } from "@/server/trips"
import { useTripTab } from "./trip-tabs"
import {
  preferenceSchema,
  DIETS,
  PACES,
  STAY_TYPES,
  TRANSPORTS,
  INTERESTS,
  type PreferenceInput,
} from "@/lib/validators"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: readonly string[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value.includes(opt)
        return (
          <button
            type="button"
            key={opt}
            aria-pressed={active}
            onClick={() =>
              onChange(
                active ? value.filter((v) => v !== opt) : [...value, opt]
              )
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-primary bg-primary/10 font-medium text-brand"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function SingleChipGroup({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            type="button"
            key={opt.value}
            aria-pressed={active}
            onClick={() => onChange(active ? "" : opt.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-primary bg-primary/10 font-medium text-brand"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function PreferenceForm({
  tripId,
  defaultValues,
  firstTime = false,
}: {
  tripId: string
  defaultValues: PreferenceInput
  /** First submission: continue the journey on the Overview afterwards. */
  firstTime?: boolean
}) {
  const { setTab } = useTripTab()
  const [pending, startTransition] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  const form = useForm<PreferenceInput>({
    resolver: zodResolver(preferenceSchema),
    defaultValues,
  })

  function onSubmit(values: PreferenceInput) {
    startTransition(async () => {
      const res = await savePreference(tripId, values)
      if (res.ok) {
        toast.success(
          firstTime
            ? "Thanks — your preferences are in"
            : "Preferences saved"
        )
        setSaved(true)
        form.reset(values)
        setTimeout(() => setSaved(false), 2000)
        if (firstTime) setTab("overview")
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="age"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Age</FormLabel>
                <FormControl>
                  <Input type="number" min={1} placeholder="—" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gender</FormLabel>
                <FormControl>
                  <Input placeholder="Optional" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="budgetPerDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Budget / day</FormLabel>
                <FormControl>
                  <Input type="number" min={0} placeholder="Optional" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="diet"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Diet</FormLabel>
              <SingleChipGroup
                options={DIETS}
                value={field.value ?? ""}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="pace"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Travel pace</FormLabel>
              <SingleChipGroup
                options={PACES}
                value={field.value ?? ""}
                onChange={field.onChange}
              />
              <FormDescription>
                Relaxed = fewer stops, more chill. Packed = see it all.
              </FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="stayTypes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Where do you like to stay?</FormLabel>
              <ChipGroup
                options={STAY_TYPES}
                value={field.value ?? []}
                onChange={field.onChange}
              />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="transports"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred transport</FormLabel>
              <ChipGroup
                options={TRANSPORTS}
                value={field.value ?? []}
                onChange={field.onChange}
              />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="interests"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Interests</FormLabel>
              <ChipGroup
                options={INTERESTS}
                value={field.value ?? []}
                onChange={field.onChange}
              />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="mustCoverPlaces"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Must-cover places</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder="Any spots you don't want to miss?"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="accessibility"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Accessibility / medical needs</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder="Anything the group should plan around?"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} className="gap-2">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {saved && !pending && <Check className="size-4" />}
            Save preferences
          </Button>
          {form.formState.isDirty && !pending && (
            <span className="text-sm text-muted-foreground">
              You have unsaved changes
            </span>
          )}
        </div>
      </form>
    </Form>
  )
}
