-- CreateTable
CREATE TABLE "TripStory" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "generatedById" TEXT,
    "shareToken" TEXT,
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripStory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripStory_tripId_key" ON "TripStory"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripStory_shareToken_key" ON "TripStory"("shareToken");

-- AddForeignKey
ALTER TABLE "TripStory" ADD CONSTRAINT "TripStory_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
