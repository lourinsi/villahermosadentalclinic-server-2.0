-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "childAppointmentId" TEXT,
ADD COLUMN     "parentAppointmentId" TEXT;

-- CreateIndex
CREATE INDEX "appointments_parentAppointmentId_idx" ON "appointments"("parentAppointmentId");

-- CreateIndex
CREATE INDEX "appointments_childAppointmentId_idx" ON "appointments"("childAppointmentId");
