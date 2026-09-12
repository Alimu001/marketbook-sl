-- CreateEnum
CREATE TYPE "CustomerWalletTransactionType" AS ENUM ('REFUND_CREDIT', 'SALE_PAYMENT', 'MANUAL_CREDIT', 'MANUAL_DEBIT');

-- CreateEnum
CREATE TYPE "RefundDestination" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'WALLET');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "walletAmountUsed" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleRefund" ADD COLUMN "walletCreditAmount" DECIMAL(19,4) NOT NULL DEFAULT 0;
ALTER TABLE "SaleRefund" ADD COLUMN "refundDestination" "RefundDestination";

-- CreateTable
CREATE TABLE "CustomerWallet" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "balance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerWalletTransaction" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "type" "CustomerWalletTransactionType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "balanceBefore" DECIMAL(19,4) NOT NULL,
    "balanceAfter" DECIMAL(19,4) NOT NULL,
    "referenceType" TEXT,
    "referenceId" UUID,
    "reason" TEXT,
    "notes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerWalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerWallet_customerId_key" ON "CustomerWallet"("customerId");

-- CreateIndex
CREATE INDEX "CustomerWallet_businessId_idx" ON "CustomerWallet"("businessId");

-- CreateIndex
CREATE INDEX "CustomerWallet_customerId_idx" ON "CustomerWallet"("customerId");

-- CreateIndex
CREATE INDEX "CustomerWallet_businessId_balance_idx" ON "CustomerWallet"("businessId", "balance");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerWallet_businessId_customerId_key" ON "CustomerWallet"("businessId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerWalletTransaction_businessId_idx" ON "CustomerWalletTransaction"("businessId");

-- CreateIndex
CREATE INDEX "CustomerWalletTransaction_customerId_idx" ON "CustomerWalletTransaction"("customerId");

-- CreateIndex
CREATE INDEX "CustomerWalletTransaction_walletId_idx" ON "CustomerWalletTransaction"("walletId");

-- CreateIndex
CREATE INDEX "CustomerWalletTransaction_businessId_createdAt_idx" ON "CustomerWalletTransaction"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerWalletTransaction_type_idx" ON "CustomerWalletTransaction"("type");

-- AddForeignKey
ALTER TABLE "CustomerWallet" ADD CONSTRAINT "CustomerWallet_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerWallet" ADD CONSTRAINT "CustomerWallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerWalletTransaction" ADD CONSTRAINT "CustomerWalletTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerWalletTransaction" ADD CONSTRAINT "CustomerWalletTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerWalletTransaction" ADD CONSTRAINT "CustomerWalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CustomerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerWalletTransaction" ADD CONSTRAINT "CustomerWalletTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
