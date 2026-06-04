ALTER TABLE "recurring_series"
ADD COLUMN IF NOT EXISTS "startDate" TEXT,
ADD COLUMN IF NOT EXISTS "endDate" TEXT;

CREATE INDEX IF NOT EXISTS "recurring_series_startDate_idx"
ON "recurring_series"("startDate");

CREATE INDEX IF NOT EXISTS "recurring_series_endDate_idx"
ON "recurring_series"("endDate");
