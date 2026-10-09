-- Shareable invite links: each trip gets an unguessable join code.
-- Added nullable first so existing trips can be backfilled, then enforced.
ALTER TABLE "Trip" ADD COLUMN "joinCode" TEXT;

UPDATE "Trip"
SET "joinCode" = substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 10)
WHERE "joinCode" IS NULL;

ALTER TABLE "Trip" ALTER COLUMN "joinCode" SET NOT NULL;

CREATE UNIQUE INDEX "Trip_joinCode_key" ON "Trip"("joinCode");
