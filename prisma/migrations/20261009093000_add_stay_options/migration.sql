CREATE TABLE "StayOption" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" TEXT,
    "rating" DOUBLE PRECISION,
    "type" TEXT,
    "amenities" TEXT[],
    "link" TEXT,
    "phone" TEXT,
    "thumbnail" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StayOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StayOption_tripId_idx" ON "StayOption"("tripId");
ALTER TABLE "StayOption" ADD CONSTRAINT "StayOption_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
