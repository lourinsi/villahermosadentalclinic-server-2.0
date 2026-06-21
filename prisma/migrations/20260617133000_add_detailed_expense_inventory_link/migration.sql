-- Add the inventory link columns used when expenses purchase stock.
ALTER TABLE "detailed_expenses" ADD COLUMN IF NOT EXISTS "inventoryItemId" TEXT;
ALTER TABLE "detailed_expenses" ADD COLUMN IF NOT EXISTS "inventoryQuantity" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "detailed_expenses_inventoryItemId_idx" ON "detailed_expenses"("inventoryItemId");
