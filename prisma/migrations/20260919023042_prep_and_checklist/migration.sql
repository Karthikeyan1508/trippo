-- CreateEnum
CREATE TYPE "ChecklistCategory" AS ENUM ('DOCUMENT', 'PACKING', 'BOOKING', 'GEAR', 'OTHER');

-- CreateTable
CREATE TABLE "PrepGuide" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "summary" TEXT,
    "etiquette" JSONB NOT NULL,
    "documents" JSONB NOT NULL,
    "packing" JSONB NOT NULL,
    "phrases" JSONB,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "model" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "ChecklistCategory" NOT NULL DEFAULT 'OTHER',
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrepGuide_tripId_key" ON "PrepGuide"("tripId");

-- CreateIndex
CREATE INDEX "ChecklistItem_tripId_userId_idx" ON "ChecklistItem"("tripId", "userId");

-- AddForeignKey
ALTER TABLE "PrepGuide" ADD CONSTRAINT "PrepGuide_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
