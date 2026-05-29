ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "appointmentSnapshot" JSONB;

ALTER TABLE "finance_records" ADD COLUMN IF NOT EXISTS "appointmentSnapshot" JSONB;
