-- AlterEnum
ALTER TYPE "InventoryTransactionType" ADD VALUE 'SALE_REFUND';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'SALE_VOID';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'PURCHASE_VOID';

-- AlterEnum
ALTER TYPE "DebtStatus" ADD VALUE 'VOIDED';

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "refundedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "status" "PurchaseStatus" NOT NULL DEFAULT 'COMPLETED';

-- CreateTable
CREATE TABLE "SaleRefund" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "refundNumber" TEXT NOT NULL,
    "refundAmount" DECIMAL(19,4) NOT NULL,
    "receivableReduction" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "cashReturnAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "refundPaymentMethod" "PaymentMethod",
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleRefundItem" (
    "id" UUID NOT NULL,
    "refundId" UUID NOT NULL,
    "saleItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitPriceSnapshot" DECIMAL(19,4) NOT NULL,
    "costPriceSnapshot" DECIMAL(19,4) NOT NULL,
    "lineRefundAmount" DECIMAL(19,4) NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleRefundItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleVoid" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleVoid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleRefundSequence" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "dateKey" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleRefundSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseVoid" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseVoid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleRefund_refundNumber_key" ON "SaleRefund"("refundNumber");

-- CreateIndex
CREATE INDEX "SaleRefund_businessId_idx" ON "SaleRefund"("businessId");

-- CreateIndex
CREATE INDEX "SaleRefund_saleId_idx" ON "SaleRefund"("saleId");

-- CreateIndex
CREATE INDEX "SaleRefund_businessId_createdAt_idx" ON "SaleRefund"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "SaleRefund_createdByUserId_idx" ON "SaleRefund"("createdByUserId");

-- CreateIndex
CREATE INDEX "SaleRefundItem_refundId_idx" ON "SaleRefundItem"("refundId");

-- CreateIndex
CREATE INDEX "SaleRefundItem_saleItemId_idx" ON "SaleRefundItem"("saleItemId");

-- CreateIndex
CREATE INDEX "SaleRefundItem_productId_idx" ON "SaleRefundItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleVoid_saleId_key" ON "SaleVoid"("saleId");

-- CreateIndex
CREATE INDEX "SaleVoid_businessId_idx" ON "SaleVoid"("businessId");

-- CreateIndex
CREATE INDEX "SaleVoid_createdByUserId_idx" ON "SaleVoid"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleRefundSequence_businessId_dateKey_key" ON "SaleRefundSequence"("businessId", "dateKey");

-- CreateIndex
CREATE INDEX "SaleRefundSequence_businessId_idx" ON "SaleRefundSequence"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseVoid_purchaseId_key" ON "PurchaseVoid"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseVoid_businessId_idx" ON "PurchaseVoid"("businessId");

-- CreateIndex
CREATE INDEX "PurchaseVoid_createdByUserId_idx" ON "PurchaseVoid"("createdByUserId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- AddForeignKey
ALTER TABLE "SaleRefund" ADD CONSTRAINT "SaleRefund_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleRefund" ADD CONSTRAINT "SaleRefund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleRefund" ADD CONSTRAINT "SaleRefund_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleRefundItem" ADD CONSTRAINT "SaleRefundItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "SaleRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleRefundItem" ADD CONSTRAINT "SaleRefundItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleRefundItem" ADD CONSTRAINT "SaleRefundItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleVoid" ADD CONSTRAINT "SaleVoid_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleVoid" ADD CONSTRAINT "SaleVoid_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleVoid" ADD CONSTRAINT "SaleVoid_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleRefundSequence" ADD CONSTRAINT "SaleRefundSequence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseVoid" ADD CONSTRAINT "PurchaseVoid_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseVoid" ADD CONSTRAINT "PurchaseVoid_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseVoid" ADD CONSTRAINT "PurchaseVoid_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
