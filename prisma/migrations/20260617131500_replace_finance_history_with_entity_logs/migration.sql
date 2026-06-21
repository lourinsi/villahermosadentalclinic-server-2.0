-- The first finance-history pass used one generic table. Replace it with
-- domain log tables that mirror the appointment/appointment_logs pattern.
DROP TABLE IF EXISTS "finance_history_logs";

-- CreateTable
CREATE TABLE "expense_logs" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "previousState" JSONB NOT NULL,
  "newState" JSONB NOT NULL,
  "changedBy" TEXT NOT NULL,
  "changedByName" TEXT,
  "changedByRole" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changeType" TEXT NOT NULL,
  "amount" DOUBLE PRECISION,
  "notes" TEXT,

  CONSTRAINT "expense_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_logs" (
  "id" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "previousState" JSONB NOT NULL,
  "newState" JSONB NOT NULL,
  "changedBy" TEXT NOT NULL,
  "changedByName" TEXT,
  "changedByRole" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changeType" TEXT NOT NULL,
  "quantityChange" DOUBLE PRECISION,
  "notes" TEXT,

  CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_logs" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "payrollMonth" TEXT,
  "payrollRecordId" TEXT,
  "previousState" JSONB NOT NULL,
  "newState" JSONB NOT NULL,
  "changedBy" TEXT NOT NULL,
  "changedByName" TEXT,
  "changedByRole" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changeType" TEXT NOT NULL,
  "amount" DOUBLE PRECISION,
  "notes" TEXT,

  CONSTRAINT "payroll_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_logs_expenseId_idx" ON "expense_logs"("expenseId");

-- CreateIndex
CREATE INDEX "expense_logs_changedAt_idx" ON "expense_logs"("changedAt");

-- CreateIndex
CREATE INDEX "inventory_logs_inventoryItemId_idx" ON "inventory_logs"("inventoryItemId");

-- CreateIndex
CREATE INDEX "inventory_logs_changedAt_idx" ON "inventory_logs"("changedAt");

-- CreateIndex
CREATE INDEX "payroll_logs_staffId_idx" ON "payroll_logs"("staffId");

-- CreateIndex
CREATE INDEX "payroll_logs_payrollMonth_idx" ON "payroll_logs"("payrollMonth");

-- CreateIndex
CREATE INDEX "payroll_logs_changedAt_idx" ON "payroll_logs"("changedAt");
