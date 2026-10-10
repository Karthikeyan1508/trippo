-- CreateEnum
CREATE TYPE "ExpenseEditStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ExpenseEdit" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "paidById" TEXT NOT NULL,
    "splitType" "SplitType" NOT NULL,
    "shares" JSONB NOT NULL,
    "status" "ExpenseEditStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseEdit_expenseId_status_idx" ON "ExpenseEdit"("expenseId", "status");
CREATE INDEX "ExpenseEdit_requestedById_idx" ON "ExpenseEdit"("requestedById");

-- AddForeignKey
ALTER TABLE "ExpenseEdit" ADD CONSTRAINT "ExpenseEdit_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseEdit" ADD CONSTRAINT "ExpenseEdit_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
