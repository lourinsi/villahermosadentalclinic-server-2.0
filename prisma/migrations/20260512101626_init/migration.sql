-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "alternateEmail" TEXT,
    "alternatePhone" TEXT,
    "password" TEXT,
    "dateOfBirth" TEXT,
    "address" TEXT,
    "city" TEXT,
    "zipCode" TEXT,
    "insurance" TEXT,
    "status" TEXT,
    "emergencyContact" TEXT,
    "emergencyPhone" TEXT,
    "medicalHistory" TEXT,
    "allergies" TEXT,
    "notes" TEXT,
    "profilePicture" TEXT,
    "parentId" TEXT,
    "isPrimary" BOOLEAN,
    "relationship" TEXT,
    "username" TEXT,
    "dentalCharts" JSONB,
    "balance" DOUBLE PRECISION,
    "lastVisit" TEXT,
    "gender" TEXT,
    "civilStatus" TEXT,
    "age" TEXT,
    "ethnicity" TEXT,
    "religion" TEXT,
    "nationality" TEXT,
    "currentStreet" TEXT,
    "currentBarangay" TEXT,
    "currentProvince" TEXT,
    "permanentStreet" TEXT,
    "permanentBarangay" TEXT,
    "permanentCity" TEXT,
    "permanentProvince" TEXT,
    "permanentZipCode" TEXT,
    "landline" TEXT,
    "emergencyFirstName" TEXT,
    "emergencyLastName" TEXT,
    "emergencyRelationship" TEXT,
    "education" TEXT,
    "occupation" TEXT,
    "company" TEXT,
    "companyAddress" TEXT,
    "height" TEXT,
    "weight" TEXT,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "customType" TEXT,
    "price" DOUBLE PRECISION,
    "discount" DOUBLE PRECISION,
    "doctor" TEXT,
    "duration" INTEGER,
    "notes" TEXT,
    "serviceType" TEXT,
    "status" TEXT,
    "cancellationReason" TEXT,
    "paymentStatus" TEXT,
    "paymentMethod" TEXT,
    "balance" DOUBLE PRECISION,
    "totalPaid" DOUBLE PRECISION,
    "transactions" JSONB,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_logs" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "previousState" JSONB NOT NULL,
    "newState" JSONB NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedByName" TEXT,
    "changedAt" TIMESTAMP(3),
    "changeType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "appointment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "transactionId" TEXT,
    "notes" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_logs" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedByName" TEXT,
    "changedAt" TIMESTAMP(3),
    "previousBalance" DOUBLE PRECISION,
    "newBalance" DOUBLE PRECISION,

    CONSTRAINT "payment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "hireDate" TEXT,
    "baseSalary" DOUBLE PRECISION,
    "status" TEXT,
    "employmentType" TEXT,
    "specialization" TEXT,
    "licenseNumber" TEXT,
    "password" TEXT,
    "profilePicture" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_financial_records" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "repaymentSchedule" TEXT,

    CONSTRAINT "staff_financial_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "hoursWorked" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daysPresent" INTEGER NOT NULL DEFAULT 0,
    "daysAbsent" INTEGER NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "isLog" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_records" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TEXT NOT NULL,
    "description" TEXT,
    "isSeeding" BOOLEAN,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "finance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detailed_expenses" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "vendor" TEXT,
    "paymentMethod" TEXT,
    "status" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "detailed_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "costPerUnit" DOUBLE PRECISION,
    "totalValue" DOUBLE PRECISION,
    "supplier" TEXT,
    "lastOrdered" TEXT,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaires" (
    "patientId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "questionnaires_pkey" PRIMARY KEY ("patientId")
);

-- CreateTable
CREATE TABLE "status_configs" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "status_configs_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "patients_email_idx" ON "patients"("email");

-- CreateIndex
CREATE INDEX "patients_phone_idx" ON "patients"("phone");

-- CreateIndex
CREATE INDEX "patients_parentId_idx" ON "patients"("parentId");

-- CreateIndex
CREATE INDEX "patients_status_idx" ON "patients"("status");

-- CreateIndex
CREATE INDEX "appointments_patientId_idx" ON "appointments"("patientId");

-- CreateIndex
CREATE INDEX "appointments_doctor_idx" ON "appointments"("doctor");

-- CreateIndex
CREATE INDEX "appointments_date_idx" ON "appointments"("date");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "appointments_paymentStatus_idx" ON "appointments"("paymentStatus");

-- CreateIndex
CREATE INDEX "appointment_logs_appointmentId_idx" ON "appointment_logs"("appointmentId");

-- CreateIndex
CREATE INDEX "appointment_logs_changedAt_idx" ON "appointment_logs"("changedAt");

-- CreateIndex
CREATE INDEX "payments_appointmentId_idx" ON "payments"("appointmentId");

-- CreateIndex
CREATE INDEX "payments_patientId_idx" ON "payments"("patientId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payment_logs_appointmentId_idx" ON "payment_logs"("appointmentId");

-- CreateIndex
CREATE INDEX "payment_logs_changedAt_idx" ON "payment_logs"("changedAt");

-- CreateIndex
CREATE INDEX "staff_email_idx" ON "staff"("email");

-- CreateIndex
CREATE INDEX "staff_role_idx" ON "staff"("role");

-- CreateIndex
CREATE INDEX "staff_status_idx" ON "staff"("status");

-- CreateIndex
CREATE INDEX "staff_financial_records_staffId_idx" ON "staff_financial_records"("staffId");

-- CreateIndex
CREATE INDEX "staff_financial_records_status_idx" ON "staff_financial_records"("status");

-- CreateIndex
CREATE INDEX "staff_attendance_staffId_idx" ON "staff_attendance"("staffId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_isRead_idx" ON "notifications"("isRead");

-- CreateIndex
CREATE INDEX "finance_records_patientId_idx" ON "finance_records"("patientId");

-- CreateIndex
CREATE INDEX "finance_records_type_idx" ON "finance_records"("type");

-- CreateIndex
CREATE INDEX "finance_records_date_idx" ON "finance_records"("date");

-- CreateIndex
CREATE INDEX "detailed_expenses_category_idx" ON "detailed_expenses"("category");

-- CreateIndex
CREATE INDEX "detailed_expenses_date_idx" ON "detailed_expenses"("date");

-- CreateIndex
CREATE INDEX "inventory_item_idx" ON "inventory"("item");
