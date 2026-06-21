WITH ranked_occurrences AS (
  SELECT
    ro."id",
    ROW_NUMBER() OVER (
      PARTITION BY ro."appointmentId"
      ORDER BY
        CASE WHEN a."recurringSeriesId" = ro."seriesId" THEN 0 ELSE 1 END,
        CASE ro."status"
          WHEN 'active' THEN 0
          WHEN 'stopped' THEN 1
          ELSE 2
        END,
        COALESCE(ro."updatedAt", ro."createdAt") DESC NULLS LAST,
        ro."createdAt" DESC NULLS LAST,
        ro."id"
    ) AS occurrence_rank
  FROM "recurring_occurrences" ro
  LEFT JOIN "appointments" a ON a."id" = ro."appointmentId"
)
DELETE FROM "recurring_occurrences" ro
USING ranked_occurrences ranked
WHERE ro."id" = ranked."id"
  AND ranked.occurrence_rank > 1;

DROP INDEX IF EXISTS "recurring_occurrences_seriesId_appointmentId_key";
DROP INDEX IF EXISTS "recurring_occurrences_appointmentId_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "recurring_occurrences_appointmentId_key"
ON "recurring_occurrences"("appointmentId");
