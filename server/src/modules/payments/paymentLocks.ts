import type { Prisma } from "../../../generated/prisma/client.js";

type TransactionClient = Prisma.TransactionClient;

export async function lockPaymentTransaction(
  tx: TransactionClient,
  paymentId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT "id"
    FROM "PaymentTransaction"
    WHERE "id" = ${paymentId}::uuid
    FOR UPDATE
  `;
}
