ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "doctorId" TEXT;

CREATE INDEX IF NOT EXISTS "appointments_doctorId_idx" ON "appointments"("doctorId");

WITH staff_keys AS (
  SELECT
    id,
    name,
    lower(trim(regexp_replace(regexp_replace(name, '^Dr\.?\s+', '', 'i'), '\s+', ' ', 'g'))) AS name_key,
    lower(trim(regexp_replace(regexp_replace(regexp_replace(id, '^(seed_)?staff_', '', 'i'), '[_-]+', ' ', 'g'), '\s+', ' ', 'g'))) AS id_key
  FROM "staff"
  WHERE deleted = false
),
appointment_keys AS (
  SELECT
    id,
    lower(trim(regexp_replace(regexp_replace(doctor, '^Dr\.?\s+', '', 'i'), '\s+', ' ', 'g'))) AS doctor_key
  FROM "appointments"
  WHERE "doctorId" IS NULL AND doctor IS NOT NULL AND trim(doctor) <> ''
)
UPDATE "appointments" AS appointment
SET
  "doctorId" = staff_keys.id,
  doctor = staff_keys.name
FROM appointment_keys
JOIN staff_keys ON
  appointment_keys.doctor_key = staff_keys.name_key OR
  appointment_keys.doctor_key = staff_keys.id_key OR
  (length(staff_keys.id_key) >= 5 AND appointment_keys.doctor_key LIKE '%' || staff_keys.id_key || '%')
WHERE appointment.id = appointment_keys.id;

UPDATE "appointments" AS appointment
SET "patientName" = COALESCE(
  NULLIF(trim(concat_ws(' ', patient."firstName", patient."lastName")), ''),
  NULLIF(trim(patient.name), ''),
  appointment."patientName"
)
FROM "patients" AS patient
WHERE
  appointment."patientId" = patient.id AND
  patient.deleted = false;
