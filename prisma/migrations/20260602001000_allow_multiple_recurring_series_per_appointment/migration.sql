DROP INDEX IF EXISTS "recurring_occurrences_appointmentId_key";

CREATE INDEX IF NOT EXISTS "recurring_occurrences_appointmentId_idx"
ON "recurring_occurrences"("appointmentId");

CREATE UNIQUE INDEX IF NOT EXISTS "recurring_occurrences_seriesId_appointmentId_key"
ON "recurring_occurrences"("seriesId", "appointmentId");
