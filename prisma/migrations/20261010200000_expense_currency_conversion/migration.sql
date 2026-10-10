-- Preserve the source amount and captured conversion used for each expense.
ALTER TABLE "Expense"
  ADD COLUMN "localAmount" DOUBLE PRECISION,
  ADD COLUMN "localCurrency" TEXT,
  ADD COLUMN "exchangeRate" DOUBLE PRECISION,
  ADD COLUMN "exchangeRateAsOf" TEXT;

ALTER TABLE "ExpenseEdit"
  ADD COLUMN "localAmount" DOUBLE PRECISION,
  ADD COLUMN "localCurrency" TEXT,
  ADD COLUMN "exchangeRate" DOUBLE PRECISION,
  ADD COLUMN "exchangeRateAsOf" TEXT;
