-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "appointmentId" TEXT;

-- CreateIndex
CREATE INDEX "notifications_appointmentId_idx" ON "notifications"("appointmentId");
