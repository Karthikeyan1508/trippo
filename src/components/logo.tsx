import Link from "next/link"
import { Compass } from "lucide-react"
import { cn } from "cn"

export function Logo({
  className,
  href = "/",
}: {
  className?: string
  href?: string
}) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center gap-2", className)}
    >
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-rotate-6">
        <Compass className="size-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight">Trippo</span>
    </Link>
  )
}
