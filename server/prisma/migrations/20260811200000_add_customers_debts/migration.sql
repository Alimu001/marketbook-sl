-- CreateEnum
CREATE TYPE "SalePaymentStatus" AS ENUM ('PAID', 'PARTIALLY_PAID', 'UNPAID');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID');

-- AlterTable: Sale - add credit/customer fields
ALTER TABLE "Sale" ADD COLUMN "customerId" UUID;
ALTER TABLE "Sale" ADD COLUMN "customerNameSnapshot" TEXT;
ALTER TABLE "Sale" ADD COLUMN "amountPaid" DECIMAL(19,4) NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "outstandingAmount" DECIMAL(19,4) NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "paymentStatus" "SalePaymentStatus" NOT NULL DEFAULT 'PAID';

-- Backfill existing sales as fully paid
UPDATE "Sale"
SET "amountPaid" = "totalAmount",
    "outstandingAmount" = 0,
    "paymentStatus" = 'PAID';

-- Make paymentMethod nullable (full credit sales may have no upfront payment method)
ALTER TABLE "Sale" ALTER COLUMN "paymentMethod" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerDebt" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "originalAmount" DECIMAL(19,4) NOT NULL,
    "amountPaid" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(19,4) NOT NULL,
    "status" "DebtStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "debtId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "recordedByUserId" UUID NOT NULL,
    "balanceBefore" DECIMAL(19,4) NOT NULL,
    "balanceAfter" DECIMAL(19,4) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_paymentStatus_idx" ON "Sale"("paymentStatus");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- CreateIndex
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");
CREATE INDEX "Customer_businessId_name_idx" ON "Customer"("businessId", "name");
CREATE INDEX "Customer_businessId_phone_idx" ON "Customer"("businessId", "phone");
CREATE INDEX "Customer_businessId_email_idx" ON "Customer"("businessId", "email");
CREATE INDEX "Customer_businessId_isActive_idx" ON "Customer"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDebt_saleId_key" ON "CustomerDebt"("saleId");
CREATE INDEX "CustomerDebt_businessId_idx" ON "CustomerDebt"("businessId");
CREATE INDEX "CustomerDebt_customerId_idx" ON "CustomerDebt"("customerId");
CREATE INDEX "CustomerDebt_businessId_status_idx" ON "CustomerDebt"("businessId", "status");
CREATE INDEX "CustomerDebt_createdAt_idx" ON "CustomerDebt"("createdAt");

-- CreateIndex
CREATE INDEX "DebtPayment_businessId_idx" ON "DebtPayment"("businessId");
CREATE INDEX "DebtPayment_customerId_idx" ON "DebtPayment"("customerId");
CREATE INDEX "DebtPayment_debtId_idx" ON "DebtPayment"("debtId");
CREATE INDEX "DebtPayment_createdAt_idx" ON "DebtPayment"("createdAt");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDebt" ADD CONSTRAINT "CustomerDebt_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDebt" ADD CONSTRAINT "CustomerDebt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDebt" ADD CONSTRAINT "CustomerDebt_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "CustomerDebt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
