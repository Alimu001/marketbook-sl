-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('OPENING_STOCK', 'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'RETURN_IN');

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lowStockThreshold" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "performedByUserId" UUID NOT NULL,
    "type" "InventoryTransactionType" NOT NULL,
    "quantityChange" DECIMAL(19,4) NOT NULL,
    "quantityBefore" DECIMAL(19,4) NOT NULL,
    "quantityAfter" DECIMAL(19,4) NOT NULL,
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_productId_key" ON "InventoryBalance"("productId");

-- CreateIndex
CREATE INDEX "InventoryBalance_businessId_idx" ON "InventoryBalance"("businessId");

-- CreateIndex
CREATE INDEX "InventoryBalance_productId_idx" ON "InventoryBalance"("productId");

-- CreateIndex
CREATE INDEX "InventoryBalance_businessId_productId_idx" ON "InventoryBalance"("businessId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_businessId_productId_key" ON "InventoryBalance"("businessId", "productId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_businessId_idx" ON "InventoryTransaction"("businessId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_productId_idx" ON "InventoryTransaction"("productId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_createdAt_idx" ON "InventoryTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_businessId_productId_idx" ON "InventoryTransaction"("businessId", "productId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_type_idx" ON "InventoryTransaction"("type");

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill inventory balances for existing products
INSERT INTO "InventoryBalance" ("id", "businessId", "productId", "quantity", "lowStockThreshold", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "businessId", "id", 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product";
