import type {
  CreatePurchaseResponse,
  PurchaseDetailResponse,
  PurchaseListItem,
} from "@marketbook/shared/types";
import type {
  CreatePurchaseInput,
  ListPurchasesQuery,
} from "@marketbook/shared/validation";
import type { PaymentMethod, Product } from "../../../generated/prisma/client.js";
import { Prisma } from "../../../generated/prisma/client.js";
import {
  formatMoney,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  toMoneyDecimalFromString,
} from "../../lib/money.js";
import { formatQuantity, toQuantityDecimal } from "../../lib/quantity.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  deriveDebtStatus,
  deriveSalePaymentStatus,
} from "../debts/debt.service.js";
import { lockInventoryBalance } from "../inventory/inventory.service.js";
import { assertSupplierInBusiness } from "../suppliers/supplier.service.js";

type TransactionClient = Prisma.TransactionClient;

interface NormalizedPurchaseItem {
  productId: string;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

interface PreparedPurchaseLine {
  product: Product;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function normalizePurchaseItems(
  items: CreatePurchaseInput["items"],
): NormalizedPurchaseItem[] {
  const merged = new Map<string, { quantity: Prisma.Decimal; unitCost: Prisma.Decimal }>();

  for (const item of items) {
    const quantity = toQuantityDecimal(item.quantity);
    const unitCost = toMoneyDecimalFromString(item.unitCost);
    const existing = merged.get(item.productId);

    if (existing) {
      if (!existing.unitCost.eq(unitCost)) {
        throw new AppError(
          400,
          "Duplicate product with different unit cost",
          "DUPLICATE_PRODUCT",
          {
            details: { productId: item.productId },
          },
        );
      }

      merged.set(item.productId, {
        quantity: existing.quantity.add(quantity),
        unitCost: existing.unitCost,
      });
      continue;
    }

    merged.set(item.productId, { quantity, unitCost });
  }

  return [...merged.entries()]
    .map(([productId, { quantity, unitCost }]) => ({
      productId,
      quantity,
      unitCost,
    }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

async function generatePurchaseNumber(
  tx: TransactionClient,
  businessId: string,
): Promise<string> {
  const dateKey = formatDateKey(new Date());
  const prefix = `PO-${dateKey}-`;

  await tx.$executeRaw`
    INSERT INTO "PurchaseNumberSequence" ("id", "businessId", "dateKey", "lastNumber", "updatedAt")
    VALUES (gen_random_uuid(), ${businessId}::uuid, ${dateKey}, 0, NOW())
    ON CONFLICT ("businessId", "dateKey") DO NOTHING
  `;

  await tx.$executeRaw`
    SELECT "id"
    FROM "PurchaseNumberSequence"
    WHERE "businessId" = ${businessId}::uuid
      AND "dateKey" = ${dateKey}
    FOR UPDATE
  `;

  const sequence = await tx.purchaseNumberSequence.update({
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

function toPurchaseDetailResponse(
  purchase: {
    id: string;
    businessId: string;
    purchaseNumber: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    outstandingAmount: Prisma.Decimal;
    paymentStatus: "PAID" | "PARTIALLY_PAID" | "UNPAID";
    paymentMethod: PaymentMethod | null;
    status: "COMPLETED" | "VOIDED";
    notes: string | null;
    supplierId: string;
    supplierNameSnapshot: string;
    createdAt: Date;
    updatedAt: Date;
    createdBy: {
      id: string;
      name: string | null;
      email: string;
    };
    supplier?: {
      id: string;
      name: string;
    } | null;
    items: Array<{
      id: string;
      productId: string;
      productNameSnapshot: string;
      skuSnapshot: string | null;
      unitSnapshot: string;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      createdAt: Date;
    }>;
  },
): PurchaseDetailResponse {
  return {
    id: purchase.id,
    businessId: purchase.businessId,
    purchaseNumber: purchase.purchaseNumber,
    subtotal: formatMoney(purchase.subtotal),
    discountAmount: formatMoney(purchase.discountAmount),
    totalAmount: formatMoney(purchase.totalAmount),
    amountPaid: formatMoney(purchase.amountPaid),
    outstandingAmount: formatMoney(purchase.outstandingAmount),
    paymentStatus: purchase.paymentStatus,
    paymentMethod: purchase.paymentMethod,
    status: purchase.status,
    notes: purchase.notes,
    supplier: {
      id: purchase.supplierId,
      name: purchase.supplierNameSnapshot,
    },
    createdBy: {
      id: purchase.createdBy.id,
      name: purchase.createdBy.name,
      email: purchase.createdBy.email,
    },
    items: purchase.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productNameSnapshot: item.productNameSnapshot,
      skuSnapshot: item.skuSnapshot,
      unitSnapshot: item.unitSnapshot,
      quantity: formatQuantity(item.quantity),
      unitCost: formatMoney(item.unitCost),
      lineSubtotal: formatMoney(item.lineSubtotal),
      createdAt: item.createdAt.toISOString(),
    })),
    createdAt: purchase.createdAt.toISOString(),
    updatedAt: purchase.updatedAt.toISOString(),
  };
}

export async function createPurchase(
  businessId: string,
  createdByUserId: string,
  input: CreatePurchaseInput,
): Promise<CreatePurchaseResponse> {
  if (input.items.length === 0) {
    throw new AppError(400, "At least one item is required", "EMPTY_PURCHASE");
  }

  const normalizedItems = normalizePurchaseItems(input.items);
  const discountAmount = toMoneyDecimalFromString(input.discountAmount ?? "0");

  const purchase = await prisma.$transaction(async (tx) => {
    const supplier = await assertSupplierInBusiness(
      businessId,
      input.supplierId,
      { requireActive: true },
    );

    const products = await tx.product.findMany({
      where: {
        id: {
          in: normalizedItems.map((item) => item.productId),
        },
      },
    });

    const productMap = new Map(products.map((product) => [product.id, product]));
    const preparedLines: PreparedPurchaseLine[] = [];

    for (const item of normalizedItems) {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      if (product.businessId !== businessId) {
        throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      const lineSubtotal = multiplyMoney(item.unitCost, item.quantity);

      preparedLines.push({
        product,
        quantity: item.quantity,
        unitCost: item.unitCost,
        lineSubtotal,
      });
    }

    const lockedBalances = new Map<
      string,
      Awaited<ReturnType<typeof lockInventoryBalance>>
    >();

    for (const line of preparedLines) {
      const balance = await lockInventoryBalance(
        tx,
        businessId,
        line.product.id,
      );
      lockedBalances.set(line.product.id, balance);
    }

    const subtotal = sumMoney(preparedLines.map((line) => line.lineSubtotal));

    if (discountAmount.gt(subtotal)) {
      throw new AppError(
        400,
        "Discount cannot exceed subtotal",
        "INVALID_DISCOUNT",
      );
    }

    const totalAmount = subtractMoney(subtotal, discountAmount);
    const amountPaid = toMoneyDecimalFromString(input.amountPaid ?? "0");

    if (amountPaid.isNegative()) {
      throw new AppError(400, "Invalid amount paid", "INVALID_AMOUNT_PAID");
    }

    if (amountPaid.gt(totalAmount)) {
      throw new AppError(
        400,
        "Amount paid cannot exceed total",
        "INVALID_AMOUNT_PAID",
      );
    }

    const outstandingAmount = subtractMoney(totalAmount, amountPaid);

    if (amountPaid.gt(0) && !input.paymentMethod) {
      throw new AppError(
        400,
        "Payment method is required when amount is paid",
        "VALIDATION_ERROR",
      );
    }

    const paymentStatus = deriveSalePaymentStatus(amountPaid, outstandingAmount);
    const purchaseNumber = await generatePurchaseNumber(tx, businessId);

    const createdPurchase = await tx.purchase.create({
      data: {
        businessId,
        createdByUserId,
        supplierId: supplier.id,
        supplierNameSnapshot: supplier.name,
        purchaseNumber,
        subtotal,
        discountAmount,
        totalAmount,
        amountPaid,
        outstandingAmount,
        paymentMethod: amountPaid.gt(0) ? input.paymentMethod! : null,
        paymentStatus,
        status: "COMPLETED",
        notes: input.notes ?? null,
        items: {
          create: preparedLines.map((line) => ({
            productId: line.product.id,
            productNameSnapshot: line.product.name,
            skuSnapshot: line.product.sku,
            unitSnapshot: line.product.unit,
            quantity: line.quantity,
            unitCost: line.unitCost,
            lineSubtotal: line.lineSubtotal,
          })),
        },
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (outstandingAmount.gt(0)) {
      await tx.supplierPayable.create({
        data: {
          businessId,
          supplierId: supplier.id,
          purchaseId: createdPurchase.id,
          originalAmount: outstandingAmount,
          amountPaid: new Prisma.Decimal(0),
          outstandingAmount,
          status: deriveDebtStatus(outstandingAmount, new Prisma.Decimal(0)),
        },
      });
    }

    for (const line of preparedLines) {
      const balance = lockedBalances.get(line.product.id)!;
      const quantityBefore = balance.quantity;
      const quantityAfter = quantityBefore.add(line.quantity);

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { quantity: quantityAfter },
      });

      await tx.inventoryTransaction.create({
        data: {
          businessId,
          productId: line.product.id,
          performedByUserId: createdByUserId,
          type: "PURCHASE",
          quantityChange: line.quantity,
          quantityBefore,
          quantityAfter,
          reason: "Purchase",
          referenceType: "PURCHASE",
          referenceId: createdPurchase.id,
          notes: input.notes ?? null,
        },
      });
    }

    return createdPurchase;
  });

  return {
    purchase: toPurchaseDetailResponse(purchase),
  };
}

export async function listPurchases(
  businessId: string,
  query: ListPurchasesQuery,
) {
  const where = {
    businessId,
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, purchases] = await prisma.$transaction([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: purchases.map(
      (purchase): PurchaseListItem => ({
        id: purchase.id,
        purchaseNumber: purchase.purchaseNumber,
        totalAmount: formatMoney(purchase.totalAmount),
        amountPaid: formatMoney(purchase.amountPaid),
        outstandingAmount: formatMoney(purchase.outstandingAmount),
        paymentStatus: purchase.paymentStatus,
        status: purchase.status,
        supplier: {
          id: purchase.supplierId,
          name: purchase.supplierNameSnapshot,
        },
        createdBy: {
          id: purchase.createdBy.id,
          name: purchase.createdBy.name,
          email: purchase.createdBy.email,
        },
        itemCount: purchase._count.items,
        createdAt: purchase.createdAt.toISOString(),
      }),
    ),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getPurchaseDetail(
  businessId: string,
  purchaseId: string,
): Promise<PurchaseDetailResponse> {
  const purchase = await prisma.purchase.findFirst({
    where: {
      id: purchaseId,
      businessId,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      supplier: {
        select: {
          id: true,
          name: true,
        },
      },
      items: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!purchase) {
    throw new AppError(404, "Purchase not found", "PURCHASE_NOT_FOUND");
  }

  return toPurchaseDetailResponse(purchase);
}
