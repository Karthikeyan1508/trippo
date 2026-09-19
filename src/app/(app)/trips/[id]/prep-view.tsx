import { ScrollText, FileCheck2, Luggage, Languages, Check } from "lucide-react"

import { Badge } from "@/components/ui/badge"

export type PrepData = {
  summary: string | null
  source: string
  etiquette: string[]
  documents: string[]
  packing: { category: string; items: string[] }[]
  phrases: { phrase: string; meaning: string }[]
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h4 className="mb-3 flex items-center gap-2 font-medium">
        <Icon className="size-4 text-primary" />
        {title}
      </h4>
      {children}
    </div>
  )
}

export function PrepView({ prep }: { prep: PrepData }) {
  return (
    <div className="space-y-4">
      {prep.summary && (
        <div className="flex items-start justify-between gap-3 rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">{prep.summary}</p>
          <Badge variant={prep.source === "AI" ? "default" : "secondary"}>
            {prep.source === "AI" ? "AI guide" : "Sample"}
          </Badge>
        </div>
      )}

      {prep.etiquette.length > 0 && (
        <Section icon={ScrollText} title="Local etiquette & tips">
          <ul className="space-y-2">
            {prep.etiquette.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {prep.documents.length > 0 && (
          <Section icon={FileCheck2} title="Documents to carry">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {prep.documents.map((d, i) => (
                <li key={i}>• {d}</li>
              ))}
            </ul>
          </Section>
        )}

        {prep.phrases.length > 0 && (
          <Section icon={Languages} title="Handy phrases">
            <ul className="space-y-1.5 text-sm">
              {prep.phrases.map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.phrase}</span>
                  <span className="text-muted-foreground"> — {p.meaning}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {prep.packing.length > 0 && (
        <Section icon={Luggage} title="Packing list">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {prep.packing.map((cat, i) => (
              <div key={i}>
                <p className="mb-1.5 text-sm font-medium">{cat.category}</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {cat.items.map((item, j) => (
                    <li key={j}>• {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
