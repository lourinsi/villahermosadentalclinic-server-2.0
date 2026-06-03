WITH ranked_children AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "parentAppointmentId"
      ORDER BY
        "sequence" ASC,
        "generatedForDate" ASC,
        "createdAt" ASC NULLS LAST,
        "id" ASC
    ) AS child_rank
  FROM "recurring_occurrences"
  WHERE "parentAppointmentId" IS NOT NULL
    AND "status" <> 'cancelled'
)
UPDATE "recurring_occurrences" ro
SET
  "status" = 'cancelled',
  "updatedAt" = NOW()
FROM ranked_children ranked
WHERE ro."id" = ranked."id"
  AND ranked.child_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "recurring_occurrences_active_parentAppointmentId_key"
ON "recurring_occurrences"("parentAppointmentId")
WHERE "parentAppointmentId" IS NOT NULL
  AND "status" <> 'cancelled';
