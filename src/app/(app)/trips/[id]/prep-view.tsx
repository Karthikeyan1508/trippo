import { ScrollText, Languages, Check, ListChecks } from "lucide-react"

import { Badge } from "@/components/ui/badge"

export type PrepData = {
  summary: string | null
  source: string
  etiquette: string[]
  phrases: { phrase: string; meaning: string }[]
}

export function PrepView({ prep }: { prep: PrepData }) {
  return (
    <div className="space-y-4">
      {prep.summary && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">{prep.summary}</p>
          <Badge variant={prep.source === "AI" ? "default" : "secondary"} className="shrink-0">
            {prep.source === "AI" ? "AI guide" : "Sample"}
          </Badge>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {prep.etiquette.length > 0 && (
          <div className="rounded-2xl border bg-card p-5">
            <h4 className="mb-3 flex items-center gap-2 font-medium">
              <ScrollText className="size-4 text-brand" />
              Local etiquette &amp; tips
            </h4>
            <ul className="space-y-2">
              {prep.etiquette.map((tip, i) => (
                <li
                  key={i}
                  className="flex gap-2.5 rounded-lg bg-muted/40 p-3 text-sm"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {prep.phrases.length > 0 && (
          <div className="rounded-2xl border bg-card p-5">
            <h4 className="mb-3 flex items-center gap-2 font-medium">
              <Languages className="size-4 text-brand" />
              Handy phrases
            </h4>
            <ul className="space-y-2">
              {prep.phrases.map((p, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{p.phrase}</span>
                  <span className="text-muted-foreground"> — {p.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ListChecks className="size-3.5" />
        Your documents &amp; packing list are in your personal checklist below.
      </p>
    </div>
  )
}
