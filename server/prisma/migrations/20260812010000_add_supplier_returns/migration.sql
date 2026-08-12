-- AlterEnum
ALTER TYPE "InventoryTransactionType" ADD VALUE 'SUPPLIER_RETURN';

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "returnedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SupplierReturn" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "returnAmount" DECIMAL(19,4) NOT NULL,
    "payableReduction" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "cashRefundAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "refundPaymentMethod" "PaymentMethod",
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnItem" (
    "id" UUID NOT NULL,
    "supplierReturnId" UUID NOT NULL,
    "purchaseItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitCostSnapshot" DECIMAL(19,4) NOT NULL,
    "lineReturnAmount" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnSequence" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "dateKey" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierReturnSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturn_returnNumber_key" ON "SupplierReturn"("returnNumber");

-- CreateIndex
CREATE INDEX "SupplierReturn_businessId_idx" ON "SupplierReturn"("businessId");

-- CreateIndex
CREATE INDEX "SupplierReturn_purchaseId_idx" ON "SupplierReturn"("purchaseId");

-- CreateIndex
CREATE INDEX "SupplierReturn_supplierId_idx" ON "SupplierReturn"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierReturn_businessId_createdAt_idx" ON "SupplierReturn"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierReturn_createdByUserId_idx" ON "SupplierReturn"("createdByUserId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_supplierReturnId_idx" ON "SupplierReturnItem"("supplierReturnId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_purchaseItemId_idx" ON "SupplierReturnItem"("purchaseItemId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_productId_idx" ON "SupplierReturnItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturnSequence_businessId_dateKey_key" ON "SupplierReturnSequence"("businessId", "dateKey");

-- CreateIndex
CREATE INDEX "SupplierReturnSequence_businessId_idx" ON "SupplierReturnSequence"("businessId");

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnSequence" ADD CONSTRAINT "SupplierReturnSequence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
