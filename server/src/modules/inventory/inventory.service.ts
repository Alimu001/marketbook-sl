import type {
  InventoryBalanceResponse,
  InventoryListItem,
  InventoryTransactionResponse,
} from "@marketbook/shared/types";
import type {
  InventoryHistoryQuery,
  ListInventoryQuery,
  OpeningStockInput,
  StockAdjustmentInput,
  UpdateLowStockThresholdInput,
} from "@marketbook/shared/validation";
import type {
  InventoryBalance,
  InventoryTransaction,
  InventoryTransactionType,
} from "../../../generated/prisma/client.js";
import { Prisma } from "../../../generated/prisma/client.js";
import {
  assertSufficientStock,
  formatQuantity,
  getSignedQuantityChange,
  isLowStock,
  toQuantityDecimal,
} from "../../lib/quantity.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

type TransactionClient = Prisma.TransactionClient;

export async function lockInventoryBalance(
  tx: TransactionClient,
  businessId: string,
  productId: string,
): Promise<InventoryBalance> {
  await tx.$executeRaw`
    SELECT "id"
    FROM "InventoryBalance"
    WHERE "businessId" = ${businessId}::uuid
      AND "productId" = ${productId}::uuid
    FOR UPDATE
  `;

  const balance = await tx.inventoryBalance.findUnique({
    where: {
      businessId_productId: {
        businessId,
        productId,
      },
    },
  });

  if (!balance) {
    throw new AppError(404, "Inventory not found", "INVENTORY_NOT_FOUND");
  }

  return balance;
}

async function assertProductInBusiness(
  businessId: string,
  productId: string,
): Promise<void> {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      businessId,
    },
    select: { id: true },
  });

  if (!product) {
    throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
  }
}

async function hasOpeningStockTransaction(
  tx: TransactionClient,
  businessId: string,
  productId: string,
): Promise<boolean> {
  const existing = await tx.inventoryTransaction.findFirst({
    where: {
      businessId,
      productId,
      type: "OPENING_STOCK",
    },
    select: { id: true },
  });

  return Boolean(existing);
}

function toBalanceResponse(
  productId: string,
  balance: InventoryBalance,
  openingStockSet: boolean,
): InventoryBalanceResponse {
  return {
    productId,
    quantity: formatQuantity(balance.quantity),
    lowStockThreshold: formatQuantity(balance.lowStockThreshold),
    isLowStock: isLowStock(balance.quantity, balance.lowStockThreshold),
    hasOpeningStock: openingStockSet,
    updatedAt: balance.updatedAt.toISOString(),
  };
}

function toTransactionResponse(
  transaction: InventoryTransaction & {
    performedBy: {
      id: string;
      name: string | null;
      email: string;
    };
  },
): InventoryTransactionResponse {
  return {
    id: transaction.id,
    type: transaction.type,
    quantityChange: formatQuantity(transaction.quantityChange),
    quantityBefore: formatQuantity(transaction.quantityBefore),
    quantityAfter: formatQuantity(transaction.quantityAfter),
    reason: transaction.reason,
    notes: transaction.notes,
    performedBy: {
      id: transaction.performedBy.id,
      name: transaction.performedBy.name,
      email: transaction.performedBy.email,
    },
    createdAt: transaction.createdAt.toISOString(),
  };
}

export async function getInventoryBalance(
  businessId: string,
  productId: string,
): Promise<InventoryBalanceResponse> {
  await assertProductInBusiness(businessId, productId);

  const balance = await prisma.inventoryBalance.findUnique({
    where: {
      businessId_productId: {
        businessId,
        productId,
      },
    },
  });

  if (!balance) {
    throw new AppError(404, "Inventory not found", "INVENTORY_NOT_FOUND");
  }

  const openingStockSet = await prisma.inventoryTransaction.findFirst({
    where: {
      businessId,
      productId,
      type: "OPENING_STOCK",
    },
    select: { id: true },
  });

  return toBalanceResponse(productId, balance, Boolean(openingStockSet));
}

export async function listInventory(
  businessId: string,
  query: ListInventoryQuery,
) {
  const where = {
    businessId,
    product: {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
              {
                sku: {
                  contains: query.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    },
  };
  const skip = (query.page - 1) * query.limit;

  if (query.lowStock !== undefined) {
    const balances = await prisma.inventoryBalance.findMany({
      where: {
        businessId,
        product: {
          ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
          ...(query.search
            ? {
                OR: [
                  {
                    name: {
                      contains: query.search,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    sku: {
                      contains: query.search,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              }
            : {}),
        },
      },
      include: {
        product: true,
      },
      orderBy: [{ product: { name: "asc" } }],
    });

    const openingStockRows = await prisma.inventoryTransaction.findMany({
      where: {
        businessId,
        productId: {
          in: balances.map((balance) => balance.productId),
        },
        type: "OPENING_STOCK",
      },
      select: { productId: true },
    });

    const openingStockProductIds = new Set(
      openingStockRows.map((row) => row.productId),
    );

    const filtered = balances.filter((balance) => {
      const low = isLowStock(balance.quantity, balance.lowStockThreshold);
      return query.lowStock ? low : !low;
    });

    const pageItems = filtered.slice(skip, skip + query.limit);

    return {
      items: pageItems.map((balance) => ({
        productId: balance.productId,
        productName: balance.product.name,
        sku: balance.product.sku,
        unit: balance.product.unit,
        quantity: formatQuantity(balance.quantity),
        lowStockThreshold: formatQuantity(balance.lowStockThreshold),
        isLowStock: isLowStock(balance.quantity, balance.lowStockThreshold),
        isActive: balance.product.isActive,
        hasOpeningStock: openingStockProductIds.has(balance.productId),
        updatedAt: balance.updatedAt.toISOString(),
      })) satisfies InventoryListItem[],
      page: query.page,
      limit: query.limit,
      total: filtered.length,
    };
  }

  const [total, balances] = await prisma.$transaction([
    prisma.inventoryBalance.count({ where }),
    prisma.inventoryBalance.findMany({
      where,
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }],
      skip,
      take: query.limit,
    }),
  ]);

  const openingStockRows = await prisma.inventoryTransaction.findMany({
    where: {
      businessId,
      productId: {
        in: balances.map((balance) => balance.productId),
      },
      type: "OPENING_STOCK",
    },
    select: { productId: true },
  });

  const openingStockProductIds = new Set(
    openingStockRows.map((row) => row.productId),
  );

  return {
    items: balances.map((balance) => ({
      productId: balance.productId,
      productName: balance.product.name,
      sku: balance.product.sku,
      unit: balance.product.unit,
      quantity: formatQuantity(balance.quantity),
      lowStockThreshold: formatQuantity(balance.lowStockThreshold),
      isLowStock: isLowStock(balance.quantity, balance.lowStockThreshold),
      isActive: balance.product.isActive,
      hasOpeningStock: openingStockProductIds.has(balance.productId),
      updatedAt: balance.updatedAt.toISOString(),
    })) satisfies InventoryListItem[],
    page: query.page,
    limit: query.limit,
    total,
  };
}

async function applyInventoryMovement(input: {
  businessId: string;
  productId: string;
  performedByUserId: string;
  type: InventoryTransactionType;
  quantityChange: Prisma.Decimal;
  reason: string | null;
  notes?: string | null;
}): Promise<InventoryBalanceResponse> {
  await assertProductInBusiness(input.businessId, input.productId);

  return prisma.$transaction(async (tx) => {
    const balance = await lockInventoryBalance(
      tx,
      input.businessId,
      input.productId,
    );

    const quantityBefore = balance.quantity;
    const quantityAfter = quantityBefore.add(input.quantityChange);

    if (quantityAfter.lt(0)) {
      throw new AppError(
        409,
        "Insufficient stock for this operation",
        "INSUFFICIENT_STOCK",
      );
    }

    const updatedBalance = await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { quantity: quantityAfter },
    });

    await tx.inventoryTransaction.create({
      data: {
        businessId: input.businessId,
        productId: input.productId,
        performedByUserId: input.performedByUserId,
        type: input.type,
        quantityChange: input.quantityChange,
        quantityBefore,
        quantityAfter,
        reason: input.reason,
        notes: input.notes ?? null,
      },
    });

    const openingStockSet = await hasOpeningStockTransaction(
      tx,
      input.businessId,
      input.productId,
    );

    return toBalanceResponse(
      input.productId,
      updatedBalance,
      openingStockSet,
    );
  });
}

export async function setOpeningStock(
  businessId: string,
  productId: string,
  performedByUserId: string,
  input: OpeningStockInput,
): Promise<InventoryBalanceResponse> {
  await assertProductInBusiness(businessId, productId);

  const quantity = toQuantityDecimal(input.quantity);
  const lowStockThreshold = toQuantityDecimal(
    input.lowStockThreshold ?? "0",
  );

  return prisma.$transaction(async (tx) => {
    const balance = await lockInventoryBalance(tx, businessId, productId);

    if (await hasOpeningStockTransaction(tx, businessId, productId)) {
      throw new AppError(
        409,
        "Opening stock has already been initialized for this product",
        "OPENING_STOCK_ALREADY_SET",
      );
    }

    if (!balance.quantity.eq(0)) {
      throw new AppError(
        409,
        "Opening stock has already been initialized for this product",
        "OPENING_STOCK_ALREADY_SET",
      );
    }

    const existingMovement = await tx.inventoryTransaction.findFirst({
      where: { businessId, productId },
      select: { id: true },
    });

    if (existingMovement) {
      throw new AppError(
        409,
        "Opening stock has already been initialized for this product",
        "OPENING_STOCK_ALREADY_SET",
      );
    }

    const updatedBalance = await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: {
        quantity,
        lowStockThreshold,
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        businessId,
        productId,
        performedByUserId,
        type: "OPENING_STOCK",
        quantityChange: quantity,
        quantityBefore: new Prisma.Decimal(0),
        quantityAfter: quantity,
        reason: "Opening stock",
        notes: input.notes ?? null,
      },
    });

    return toBalanceResponse(productId, updatedBalance, true);
  });
}

export async function adjustInventory(
  businessId: string,
  productId: string,
  performedByUserId: string,
  input: StockAdjustmentInput,
): Promise<InventoryBalanceResponse> {
  const quantity = toQuantityDecimal(input.quantity);
  const signedChange = getSignedQuantityChange(input.type, quantity);

  if (signedChange.eq(0)) {
    throw new AppError(
      400,
      "Invalid inventory adjustment",
      "INVALID_INVENTORY_ADJUSTMENT",
    );
  }

  const openingStockSet = await prisma.inventoryTransaction.findFirst({
    where: {
      businessId,
      productId,
      type: "OPENING_STOCK",
    },
    select: { id: true },
  });

  if (!openingStockSet) {
    throw new AppError(
      409,
      "Initialize opening stock before making adjustments",
      "OPENING_STOCK_NOT_SET",
    );
  }

  if (signedChange.isNegative()) {
    const balance = await prisma.inventoryBalance.findUnique({
      where: {
        businessId_productId: { businessId, productId },
      },
    });

    if (!balance) {
      throw new AppError(404, "Inventory not found", "INVENTORY_NOT_FOUND");
    }

    assertSufficientStock(balance.quantity, quantity);
  }

  return applyInventoryMovement({
    businessId,
    productId,
    performedByUserId,
    type: input.type,
    quantityChange: signedChange,
    reason: input.reason,
    notes: input.notes ?? null,
  });
}

export async function updateLowStockThreshold(
  businessId: string,
  productId: string,
  input: UpdateLowStockThresholdInput,
): Promise<InventoryBalanceResponse> {
  await assertProductInBusiness(businessId, productId);

  const lowStockThreshold = toQuantityDecimal(input.lowStockThreshold);

  const balance = await prisma.inventoryBalance.update({
    where: {
      businessId_productId: {
        businessId,
        productId,
      },
    },
    data: { lowStockThreshold },
  });

  const openingStockSet = await prisma.inventoryTransaction.findFirst({
    where: {
      businessId,
      productId,
      type: "OPENING_STOCK",
    },
    select: { id: true },
  });

  return toBalanceResponse(productId, balance, Boolean(openingStockSet));
}

export async function getInventoryHistory(
  businessId: string,
  productId: string,
  query: InventoryHistoryQuery,
) {
  await assertProductInBusiness(businessId, productId);

  const where = {
    businessId,
    productId,
  };

  const skip = (query.page - 1) * query.limit;

  const [total, transactions] = await prisma.$transaction([
    prisma.inventoryTransaction.count({ where }),
    prisma.inventoryTransaction.findMany({
      where,
      include: {
        performedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: transactions.map(toTransactionResponse),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function createInventoryBalanceForProduct(
  tx: TransactionClient,
  businessId: string,
  productId: string,
): Promise<void> {
  await tx.inventoryBalance.create({
    data: {
      businessId,
      productId,
      quantity: 0,
      lowStockThreshold: 0,
    },
  });
}
