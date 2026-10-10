"use client"

import * as React from "react"

import type { ChatMessageDTO } from "@/lib/chat"

export type Role = "ADMIN" | "MEMBER" | "OBSERVER"

export type Crew = { id: string; name: string; image: string | null; role: Role }

export type PlanDay = { dayNumber: number; label: string }

/** What every piece of the chat needs to know and be able to do, without passing it down by hand. */
export type ChatActions = {
  tripId: string
  currency: string
  viewer: Crew
  crew: Crew[]
  /** The itinerary's days, for "add to day...". Empty until a plan exists. */
  planDays: PlanDay[]
  /** Pulls the latest messages now (after a vote, an add, a new poll...). */
  refresh: () => Promise<void>
  /** Puts text in the composer and focuses it. */
  prefill: (text: string) => void
  /** Sends a message as the viewer right away (used by suggestion chips). */
  send: (text: string) => Promise<void>
  /** Scrolls to a message and flashes it. */
  jumpTo: (messageId: string) => void
  /** Quotes a message in the next reply. */
  reply: (message: ChatMessageDTO) => void
  /** Applies a change to one message right away, before the server confirms. */
  patch: (messageId: string, change: (m: ChatMessageDTO) => ChatMessageDTO) => void
  /** Tries a message that failed to send again, or drops it. */
  retrySend: (messageId: string) => void
  discard: (messageId: string) => void
}

const ChatContext = React.createContext<ChatActions | null>(null)

export const ChatProvider = ChatContext.Provider

export function useChat(): ChatActions {
  const ctx = React.useContext(ChatContext)
  if (!ctx) throw new Error("useChat must be used inside <CrewChat>")
  return ctx
}

export const isObserver = (role: Role) => role === "OBSERVER"
