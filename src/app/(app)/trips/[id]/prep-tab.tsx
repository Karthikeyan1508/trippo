import { Download, ListChecks } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checklist } from "./checklist"
import { GeneratePrepButton } from "./generate-prep-button"
import { PrepView } from "./prep-view"

type ChecklistItem = {
  id: string
  label: string
  category: string
  isDone: boolean
}

export function PrepTab({
  tripId,
  prep,
  checklist,
  isAdmin,
  canDownload,
}: {
  tripId: string
  prep: {
    summary: string | null
    source: string
    etiquette: unknown
    phrases: unknown
  } | null
  checklist: ChecklistItem[]
  isAdmin: boolean
  canDownload: boolean
}) {
  return (
    <div className="space-y-5 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Prep & packing</h3>
          <p className="text-sm text-muted-foreground">
            Local know-how for everyone, plus your own private checklist.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDownload && (
            <Button asChild variant="outline" className="gap-2">
              <a href={`/print/trips/${tripId}`} target="_blank" rel="noopener noreferrer">
                <Download className="size-4" />
                Download PDF
              </a>
            </Button>
          )}
          {isAdmin && <GeneratePrepButton tripId={tripId} hasExisting={!!prep} />}
        </div>
      </div>

      {prep ? (
        <>
          <PrepView
            prep={{
              summary: prep.summary,
              source: prep.source,
              etiquette: (prep.etiquette as string[]) ?? [],
              phrases: (prep.phrases as { phrase: string; meaning: string }[]) ?? [],
            }}
          />
          <Checklist tripId={tripId} items={checklist} />
        </>
      ) : (
        <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-brand">
            <ListChecks className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">No prep guide yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Generate destination etiquette, handy phrases and a packing checklist your whole crew gets."
              : "The trip admin hasn't generated the prep guide yet."}
          </p>
          {isAdmin && (
            <div className="mt-6">
              <GeneratePrepButton tripId={tripId} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
