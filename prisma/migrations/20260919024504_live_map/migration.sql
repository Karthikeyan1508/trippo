-- CreateEnum
CREATE TYPE "CheckpointType" AS ENUM ('POINT', 'STAY', 'FOOD', 'MEETING', 'DANGER');

-- CreateTable
CREATE TABLE "MemberLocation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "type" "CheckpointType" NOT NULL DEFAULT 'POINT',
    "createdById" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberLocation_tripId_idx" ON "MemberLocation"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberLocation_tripId_userId_key" ON "MemberLocation"("tripId", "userId");

-- CreateIndex
CREATE INDEX "Checkpoint_tripId_idx" ON "Checkpoint"("tripId");

-- AddForeignKey
ALTER TABLE "MemberLocation" ADD CONSTRAINT "MemberLocation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberLocation" ADD CONSTRAINT "MemberLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
