-- CreateTable
CREATE TABLE "BusinessActivity" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessActivity_businessId_createdAt_idx" ON "BusinessActivity"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessActivity_businessId_actorUserId_createdAt_idx" ON "BusinessActivity"("businessId", "actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessActivity" ADD CONSTRAINT "BusinessActivity_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessActivity" ADD CONSTRAINT "BusinessActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
