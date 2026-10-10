"use client"

import * as React from "react"
import { cn } from "cn"

import { TRIPPO_HANDLE } from "@/lib/chat"

/**
 * Chat text with a little structure: **bold**, "- " bullets, links, and @mentions.
 * Built from React nodes (never raw HTML), and only http(s) links are made clickable.
 */

const TOKEN = /(\*\*[^*\n]+\*\*|https?:\/\/[^\s<>)]+|@[\p{L}][\p{L}'’-]*)/gu

function Inline({ text, names, own }: { text: string; names: Set<string>; own: boolean }) {
  const parts = text.split(TOKEN).filter((p) => p !== "")
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all underline underline-offset-2 hover:text-foreground"
            >
              {part.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}
            </a>
          )
        }
        if (part.startsWith("@")) {
          const handle = part.slice(1).toLowerCase()
          const isTrippo = handle === TRIPPO_HANDLE
          if (isTrippo || names.has(handle)) {
            return (
              <span
                key={i}
                className={cn(
                  "px-1 font-medium",
                  isTrippo ? "bg-primary text-primary-foreground" : own ? "bg-foreground/10" : "bg-primary/20 text-brand"
                )}
              >
                {part}
              </span>
            )
          }
        }
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
    </>
  )
}

export function RichText({
  text,
  crewNames,
  own = false,
  className,
}: {
  text: string
  crewNames: string[]
  own?: boolean
  className?: string
}) {
  const names = React.useMemo(() => new Set(crewNames.map((n) => n.split(/\s+/)[0].toLowerCase())), [crewNames])

  // Group lines: consecutive "- " lines become one list, everything else is its own paragraph.
  const blocks: { kind: "p" | "ul"; lines: string[] }[] = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) {
      const last = blocks[blocks.length - 1]
      if (last?.kind === "ul") last.lines.push(bullet[1])
      else blocks.push({ kind: "ul", lines: [bullet[1]] })
    } else {
      blocks.push({ kind: "p", lines: [line] })
    }
  }

  return (
    <div className={cn("space-y-1.5 text-sm leading-relaxed break-words", className)}>
      {blocks.map((block, i) =>
        block.kind === "ul" ? (
          <ul key={i} className="space-y-1 pl-4">
            {block.lines.map((l, j) => (
              <li key={j} className="relative before:absolute before:-left-3 before:top-[0.6em] before:size-1 before:bg-primary before:content-['']">
                <Inline text={l} names={names} own={own} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inline text={block.lines[0]} names={names} own={own} />
          </p>
        )
      )}
    </div>
  )
}
