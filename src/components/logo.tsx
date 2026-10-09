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
      className={cn("group inline-flex items-center gap-2.5", className)}
    >
      <span className="grid size-8 place-items-center bg-primary text-primary-foreground transition-transform group-hover:scale-105">
        <Compass className="size-[18px]" />
      </span>
      <span className="text-lg font-semibold tracking-tight">Trippo</span>
    </Link>
  )
}
