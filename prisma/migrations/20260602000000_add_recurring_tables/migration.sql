ALTER TABLE "appointments"
ADD COLUMN IF NOT EXISTS "recurringSeriesId" TEXT;

CREATE TABLE IF NOT EXISTS "recurring_series" (
  "id" TEXT NOT NULL,
  "rootAppointmentId" TEXT NOT NULL,
  "interval" TEXT NOT NULL,
  "customDate" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),

  CONSTRAINT "recurring_series_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recurring_occurrences" (
  "id" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "parentAppointmentId" TEXT,
  "sequence" INTEGER NOT NULL,
  "generatedForDate" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),

  CONSTRAINT "recurring_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "appointments_recurringSeriesId_idx"
ON "appointments"("recurringSeriesId");

CREATE INDEX IF NOT EXISTS "recurring_series_rootAppointmentId_idx"
ON "recurring_series"("rootAppointmentId");

CREATE INDEX IF NOT EXISTS "recurring_series_status_idx"
ON "recurring_series"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "recurring_occurrences_appointmentId_key"
ON "recurring_occurrences"("appointmentId");

CREATE INDEX IF NOT EXISTS "recurring_occurrences_seriesId_idx"
ON "recurring_occurrences"("seriesId");

CREATE INDEX IF NOT EXISTS "recurring_occurrences_parentAppointmentId_idx"
ON "recurring_occurrences"("parentAppointmentId");

CREATE INDEX IF NOT EXISTS "recurring_occurrences_generatedForDate_idx"
ON "recurring_occurrences"("generatedForDate");

CREATE INDEX IF NOT EXISTS "recurring_occurrences_status_idx"
ON "recurring_occurrences"("status");
