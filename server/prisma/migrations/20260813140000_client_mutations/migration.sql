-- CreateEnum
CREATE TYPE "ClientMutationEntityType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'EXPENSE');

-- CreateTable
CREATE TABLE "ClientMutation" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "mutationId" TEXT NOT NULL,
    "entityType" "ClientMutationEntityType" NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resultEntityId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientMutation_businessId_idx" ON "ClientMutation"("businessId");

-- CreateIndex
CREATE INDEX "ClientMutation_userId_idx" ON "ClientMutation"("userId");

-- CreateIndex
CREATE INDEX "ClientMutation_entityType_idx" ON "ClientMutation"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMutation_businessId_mutationId_key" ON "ClientMutation"("businessId", "mutationId");

-- AddForeignKey
ALTER TABLE "ClientMutation" ADD CONSTRAINT "ClientMutation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMutation" ADD CONSTRAINT "ClientMutation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
