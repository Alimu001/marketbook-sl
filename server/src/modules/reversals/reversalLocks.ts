import { Prisma } from "../../../generated/prisma/client.js";

type TransactionClient = Prisma.TransactionClient;

export async function lockSale(
  tx: TransactionClient,
  businessId: string,
  saleId: string,
) {
  await tx.$executeRaw`
    SELECT "id"
    FROM "Sale"
    WHERE "id" = ${saleId}::uuid
      AND "businessId" = ${businessId}::uuid
    FOR UPDATE
  `;

  const sale = await tx.sale.findFirst({
    where: {
      id: saleId,
      businessId,
    },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
      },
      debt: true,
      void: true,
    },
  });

  return sale;
}

export async function lockPurchase(
  tx: TransactionClient,
  businessId: string,
  purchaseId: string,
) {
  await tx.$executeRaw`
    SELECT "id"
    FROM "Purchase"
    WHERE "id" = ${purchaseId}::uuid
      AND "businessId" = ${businessId}::uuid
    FOR UPDATE
  `;

  const purchase = await tx.purchase.findFirst({
    where: {
      id: purchaseId,
      businessId,
    },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
      },
      payable: {
        include: {
          payments: true,
        },
      },
      void: true,
    },
  });

  return purchase;
}

export async function getRefundedQuantitiesBySaleItem(
  tx: TransactionClient,
  saleId: string,
): Promise<Map<string, Prisma.Decimal>> {
  const rows = await tx.saleRefundItem.groupBy({
    by: ["saleItemId"],
    where: {
      refund: {
        saleId,
      },
    },
    _sum: {
      quantity: true,
    },
  });

  const map = new Map<string, Prisma.Decimal>();

  for (const row of rows) {
    map.set(row.saleItemId, row._sum.quantity ?? new Prisma.Decimal(0));
  }

  return map;
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function generateRefundNumber(
  tx: TransactionClient,
  businessId: string,
): Promise<string> {
  const dateKey = formatDateKey(new Date());
  const prefix = `RF-${dateKey}-`;

  await tx.$executeRaw`
    INSERT INTO "SaleRefundSequence" ("id", "businessId", "dateKey", "lastNumber", "updatedAt")
    VALUES (gen_random_uuid(), ${businessId}::uuid, ${dateKey}, 0, NOW())
    ON CONFLICT ("businessId", "dateKey") DO NOTHING
  `;

  await tx.$executeRaw`
    SELECT "id"
    FROM "SaleRefundSequence"
    WHERE "businessId" = ${businessId}::uuid
      AND "dateKey" = ${dateKey}
    FOR UPDATE
  `;

  const sequence = await tx.saleRefundSequence.update({
    where: {
      businessId_dateKey: {
        businessId,
        dateKey,
      },
    },
    data: {
      lastNumber: {
        increment: 1,
      },
    },
  });

  return `${prefix}${String(sequence.lastNumber).padStart(6, "0")}`;
}
