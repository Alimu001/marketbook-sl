-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MOCK', 'ORANGE_MONEY', 'AFRIMONEY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('MANUAL', 'PROVIDER');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WalletReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- DropIndex
DROP INDEX "Purchase_status_idx";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "paymentProvider" "PaymentProvider",
ADD COLUMN     "paymentSource" "PaymentSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "providerReference" TEXT;

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "saleId" UUID,
    "customerId" UUID,
    "provider" "PaymentProvider" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "walletAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "discountAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SLE',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "providerTransactionId" TEXT,
    "merchantReference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "payToken" TEXT,
    "notifToken" TEXT,
    "paymentUrl" TEXT,
    "checkoutPayload" JSONB NOT NULL,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "initiatedByUserId" UUID NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "paymentTransactionId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "providerRequestReference" TEXT,
    "providerResponseStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "paymentTransactionId" UUID NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletReservation" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "paymentTransactionId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "WalletReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_saleId_key" ON "PaymentTransaction"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_merchantReference_key" ON "PaymentTransaction"("merchantReference");

-- CreateIndex
CREATE INDEX "PaymentTransaction_businessId_idx" ON "PaymentTransaction"("businessId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_businessId_status_idx" ON "PaymentTransaction"("businessId", "status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_businessId_provider_idx" ON "PaymentTransaction"("businessId", "provider");

-- CreateIndex
CREATE INDEX "PaymentTransaction_businessId_createdAt_idx" ON "PaymentTransaction"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_idx" ON "PaymentTransaction"("status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_providerTransactionId_idx" ON "PaymentTransaction"("providerTransactionId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_initiatedByUserId_idx" ON "PaymentTransaction"("initiatedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_businessId_idempotencyKey_key" ON "PaymentTransaction"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAttempt_paymentTransactionId_idx" ON "PaymentAttempt"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "InventoryReservation_businessId_idx" ON "InventoryReservation"("businessId");

-- CreateIndex
CREATE INDEX "InventoryReservation_productId_idx" ON "InventoryReservation"("productId");

-- CreateIndex
CREATE INDEX "InventoryReservation_paymentTransactionId_idx" ON "InventoryReservation"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "InventoryReservation_businessId_productId_status_idx" ON "InventoryReservation"("businessId", "productId", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_expiresAt_idx" ON "InventoryReservation"("expiresAt");

-- CreateIndex
CREATE INDEX "WalletReservation_businessId_idx" ON "WalletReservation"("businessId");

-- CreateIndex
CREATE INDEX "WalletReservation_customerId_idx" ON "WalletReservation"("customerId");

-- CreateIndex
CREATE INDEX "WalletReservation_paymentTransactionId_idx" ON "WalletReservation"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "WalletReservation_businessId_customerId_status_idx" ON "WalletReservation"("businessId", "customerId", "status");

-- CreateIndex
CREATE INDEX "WalletReservation_expiresAt_idx" ON "WalletReservation"("expiresAt");

-- CreateIndex
CREATE INDEX "Sale_paymentSource_idx" ON "Sale"("paymentSource");

-- CreateIndex
CREATE INDEX "Sale_paymentProvider_idx" ON "Sale"("paymentProvider");

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletReservation" ADD CONSTRAINT "WalletReservation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletReservation" ADD CONSTRAINT "WalletReservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletReservation" ADD CONSTRAINT "WalletReservation_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
