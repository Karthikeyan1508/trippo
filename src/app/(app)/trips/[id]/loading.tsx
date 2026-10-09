import { Skeleton } from "@/components/ui/skeleton"

/** Shown instantly while the trip loads — mirrors the sidebar + hub layout. */
export default function TripLoading() {
  return (
    <div className="flex min-h-svh w-full">
      <aside className="hidden w-64 shrink-0 space-y-3 border-r p-4 md:block">
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="space-y-2 border-b px-6 py-4">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="space-y-5 p-6">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      </main>
    </div>
  )
}
