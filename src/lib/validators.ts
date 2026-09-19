import { z } from "zod"

// ── Option constants (also used to render form controls) ──────────────

export const TRIP_TYPES = [
  { value: "LEISURE", label: "Leisure" },
  { value: "ADVENTURE", label: "Adventure" },
  { value: "PILGRIMAGE", label: "Pilgrimage" },
  { value: "PARTY", label: "Party" },
  { value: "WORKATION", label: "Workation" },
] as const

export const ROLES = [
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "OBSERVER", label: "Observer" },
] as const

export const DIETS = [
  { value: "VEG", label: "Vegetarian" },
  { value: "NON_VEG", label: "Non-vegetarian" },
  { value: "VEGAN", label: "Vegan" },
  { value: "JAIN", label: "Jain" },
  { value: "EGGETARIAN", label: "Eggetarian" },
] as const

export const STAY_TYPES = [
  "Dorm",
  "Hostel",
  "Hotel",
  "Airbnb",
  "Homestay",
] as const

export const TRANSPORTS = [
  "Bike",
  "Car",
  "Cab",
  "Train",
  "Govt bus",
  "Private bus",
  "Flight",
] as const

export const INTERESTS = [
  "Pubs",
  "Parties",
  "Sports",
  "Shopping",
  "Temples",
  "Museums",
  "Trekking",
  "Nightlife",
  "Beaches",
  "Food",
] as const

export const PACES = [
  { value: "RELAXED", label: "Relaxed" },
  { value: "PACKED", label: "Packed" },
] as const

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as const

// ── Helpers ───────────────────────────────────────────────────────────

// Keeps form fields as strings (react-hook-form friendly); the server
// actions coerce these to numbers after validation.
const optionalIntString = (opts?: { min?: number; max?: number }) =>
  z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => {
        if (!v) return true
        if (!/^\d+$/.test(v)) return false
        const n = Number(v)
        return n >= (opts?.min ?? 0) && n <= (opts?.max ?? 100_000_000)
      },
      { message: "Enter a valid number" }
    )

export function toInt(v: string | undefined | null): number | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

// ── Schemas ───────────────────────────────────────────────────────────

export const createTripSchema = z
  .object({
    name: z.string().trim().min(2, "Give your trip a name").max(80),
    destination: z
      .string()
      .trim()
      .min(2, "Where are you headed?")
      .max(120),
    originCity: z.string().trim().max(120).optional().or(z.literal("")),
    startDate: z.string().min(1, "Pick a start date"),
    endDate: z.string().min(1, "Pick an end date"),
    tripType: z.enum(TRIP_TYPES.map((t) => t.value) as [string, ...string[]]),
    budgetPerPerson: optionalIntString({ min: 0 }),
    currency: z.enum(CURRENCIES).default("INR"),
  })
  .refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
    message: "End date can't be before the start date",
    path: ["endDate"],
  })

export type CreateTripInput = z.input<typeof createTripSchema>

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z
    .enum(ROLES.map((r) => r.value) as [string, ...string[]])
    .default("MEMBER"),
})

export type InviteInput = z.input<typeof inviteSchema>

export const preferenceSchema = z.object({
  age: optionalIntString({ min: 1, max: 120 }),
  gender: z.string().trim().max(30).optional().or(z.literal("")),
  diet: z
    .enum(DIETS.map((d) => d.value) as [string, ...string[]])
    .optional()
    .or(z.literal("")),
  stayTypes: z.array(z.string()).default([]),
  transports: z.array(z.string()).default([]),
  interests: z.array(z.string()).default([]),
  pace: z
    .enum(PACES.map((p) => p.value) as [string, ...string[]])
    .optional()
    .or(z.literal("")),
  budgetPerDay: optionalIntString({ min: 0 }),
  accessibility: z.string().trim().max(300).optional().or(z.literal("")),
  mustCoverPlaces: z.string().trim().max(1000).optional().or(z.literal("")),
})

export type PreferenceInput = z.input<typeof preferenceSchema>
