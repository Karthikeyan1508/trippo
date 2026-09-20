import {
  UtensilsCrossed,
  BedDouble,
  Car,
  Ticket,
  ShoppingBag,
  Package,
  type LucideIcon,
} from "lucide-react"

export const EXPENSE_ICONS: Record<string, LucideIcon> = {
  FOOD: UtensilsCrossed,
  STAY: BedDouble,
  TRANSPORT: Car,
  ACTIVITY: Ticket,
  SHOPPING: ShoppingBag,
  MISC: Package,
}

export const EXPENSE_LABELS: Record<string, string> = {
  FOOD: "Food",
  STAY: "Stay",
  TRANSPORT: "Transport",
  ACTIVITY: "Activity",
  SHOPPING: "Shopping",
  MISC: "Misc",
}

export function expenseIcon(category: string): LucideIcon {
  return EXPENSE_ICONS[category] ?? Package
}
