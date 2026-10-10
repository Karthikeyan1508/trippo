-- Crew chat: messages (people, Trippo, polls, notices), itinerary-change requests,
-- richer polls and per-member read tracking.

CREATE TYPE "ChatKind" AS ENUM ('TEXT', 'AI', 'POLL', 'SYSTEM', 'REQUEST');

ALTER TABLE "Poll"
  ADD COLUMN "meta" JSONB,
  ADD COLUMN "sourceMessageId" TEXT,
  ADD COLUMN "sourceCardId" TEXT,
  ADD COLUMN "announcedAt" TIMESTAMP(3);

ALTER TABLE "TripMember"
  ADD COLUMN "chatReadAt" TIMESTAMP(3),
  ADD COLUMN "chatSeenAt" TIMESTAMP(3);

CREATE TABLE "ItineraryRequest" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "kind" TEXT NOT NULL,
  "messageId" TEXT,
  "itemKey" TEXT,
  "item" JSONB NOT NULL,
  "dayNumber" INTEGER,
  "startTime" TEXT,
  "note" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItineraryRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "authorId" TEXT,
  "kind" "ChatKind" NOT NULL DEFAULT 'TEXT',
  "body" TEXT NOT NULL DEFAULT '',
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "replyToId" TEXT,
  "mentionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "pollId" TEXT,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessage_pollId_key" ON "ChatMessage"("pollId");
CREATE UNIQUE INDEX "ChatMessage_requestId_key" ON "ChatMessage"("requestId");
CREATE INDEX "ChatMessage_tripId_createdAt_idx" ON "ChatMessage"("tripId", "createdAt");
CREATE INDEX "ChatMessage_tripId_updatedAt_idx" ON "ChatMessage"("tripId", "updatedAt");
CREATE INDEX "ItineraryRequest_tripId_status_idx" ON "ItineraryRequest"("tripId", "status");
CREATE INDEX "ItineraryRequest_messageId_itemKey_idx" ON "ItineraryRequest"("messageId", "itemKey");

ALTER TABLE "ItineraryRequest" ADD CONSTRAINT "ItineraryRequest_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItineraryRequest" ADD CONSTRAINT "ItineraryRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItineraryRequest" ADD CONSTRAINT "ItineraryRequest_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_pollId_fkey"
  FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ItineraryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Polls that already exist show up in the chat too (their old votes stay as they were).
INSERT INTO "ChatMessage" ("id", "tripId", "authorId", "kind", "body", "pollId", "createdAt", "updatedAt")
SELECT 'cm' || substr(md5(p."id" || 'chat'), 1, 22), p."tripId", p."createdById", 'POLL', p."question", p."id", p."createdAt", p."createdAt"
FROM "Poll" p;
