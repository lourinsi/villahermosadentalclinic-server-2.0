ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "isRecurring" BOOLEAN NOT NULL DEFAULT false;

UPDATE "appointments"
SET "isRecurring" = CASE
  WHEN "recurrence" IS NOT NULL AND lower("recurrence"->>'enabled') = 'true' THEN true
  ELSE false
END;
