-- AlterTable
ALTER TABLE "detailed_expenses" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "detailed_expenses_createdAt_idx" ON "detailed_expenses"("createdAt");
