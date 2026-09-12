-- Document sequences are maintained independently per business. Their generated
-- values must therefore be unique within a business, not across all businesses.
DROP INDEX IF EXISTS "Sale_receiptNumber_key";
DROP INDEX IF EXISTS "SaleRefund_refundNumber_key";
DROP INDEX IF EXISTS "Purchase_purchaseNumber_key";
DROP INDEX IF EXISTS "SupplierReturn_returnNumber_key";

CREATE UNIQUE INDEX "Sale_businessId_receiptNumber_key"
ON "Sale"("businessId", "receiptNumber");

CREATE UNIQUE INDEX "SaleRefund_businessId_refundNumber_key"
ON "SaleRefund"("businessId", "refundNumber");

CREATE UNIQUE INDEX "Purchase_businessId_purchaseNumber_key"
ON "Purchase"("businessId", "purchaseNumber");

CREATE UNIQUE INDEX "SupplierReturn_businessId_returnNumber_key"
ON "SupplierReturn"("businessId", "returnNumber");
