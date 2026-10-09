-- Gear & shopping: crew-suggested products and "I need this" votes.
CREATE TABLE "ProductSuggestion" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "suggestedById" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "image" TEXT,
    "price" TEXT,
    "priceValue" DOUBLE PRECISION,
    "rating" DOUBLE PRECISION,
    "reviews" INTEGER,
    "note" TEXT,
    "query" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductVote" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductSuggestion_tripId_asin_key" ON "ProductSuggestion"("tripId", "asin");
CREATE INDEX "ProductSuggestion_tripId_idx" ON "ProductSuggestion"("tripId");
CREATE UNIQUE INDEX "ProductVote_productId_userId_key" ON "ProductVote"("productId", "userId");
CREATE INDEX "ProductVote_userId_idx" ON "ProductVote"("userId");

ALTER TABLE "ProductSuggestion" ADD CONSTRAINT "ProductSuggestion_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSuggestion" ADD CONSTRAINT "ProductSuggestion_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVote" ADD CONSTRAINT "ProductVote_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVote" ADD CONSTRAINT "ProductVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
