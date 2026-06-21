-- AlterTable
ALTER TABLE "detailed_expenses" ADD COLUMN "paymentDate" TEXT;

-- Backfill existing paid expenses so old cash transactions keep their historical date.
UPDATE "detailed_expenses"
SET "paymentDate" = "date"
WHERE LOWER(COALESCE("status", '')) IN ('paid', 'settled', 'complete', 'completed')
  AND "paymentDate" IS NULL;

-- CreateIndex
CREATE INDEX "detailed_expenses_paymentDate_idx" ON "detailed_expenses"("paymentDate");
