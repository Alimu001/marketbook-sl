import type {
  CreateSaleResponse,
  SaleDetailResponse,
  SaleListItem,
} from "@marketbook/shared/types";
import type { CreateSaleInput, ListSalesQuery } from "@marketbook/shared/validation";
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
import { lockInventoryBalance } from "../inventory/inventory.service.js";
import { assertCustomerInBusiness } from "../customers/customer.service.js";
import {
  deriveDebtStatus,
  deriveSalePaymentStatus,
} from "../debts/debt.service.js";

type TransactionClient = Prisma.TransactionClient;

interface NormalizedSaleItem {
  productId: string;
  quantity: Prisma.Decimal;
}

interface PreparedSaleLine {
  product: Product;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function normalizeSaleItems(items: CreateSaleInput["items"]): NormalizedSaleItem[] {
  const merged = new Map<string, Prisma.Decimal>();

  for (const item of items) {
    const quantity = toQuantityDecimal(item.quantity);
    const existing = merged.get(item.productId);

    if (existing) {
      merged.set(item.productId, existing.add(quantity));
      continue;
    }

    merged.set(item.productId, quantity);
  }

  return [...merged.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

async function generateReceiptNumber(
  tx: TransactionClient,
  businessId: string,
): Promise<string> {
  const dateKey = formatDateKey(new Date());
  const prefix = `MB-${dateKey}-`;

  await tx.$executeRaw`
    INSERT INTO "SaleReceiptSequence" ("id", "businessId", "dateKey", "lastNumber", "updatedAt")
    VALUES (gen_random_uuid(), ${businessId}::uuid, ${dateKey}, 0, NOW())
    ON CONFLICT ("businessId", "dateKey") DO NOTHING
  `;

  await tx.$executeRaw`
    SELECT "id"
    FROM "SaleReceiptSequence"
    WHERE "businessId" = ${businessId}::uuid
      AND "dateKey" = ${dateKey}
    FOR UPDATE
  `;

  const sequence = await tx.saleReceiptSequence.update({
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

function toSaleDetailResponse(
  sale: {
    id: string;
    businessId: string;
    receiptNumber: string;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    outstandingAmount: Prisma.Decimal;
    paymentStatus: "PAID" | "PARTIALLY_PAID" | "UNPAID";
    paymentMethod: PaymentMethod | null;
    status: "COMPLETED" | "VOIDED";
    notes: string | null;
    customerId: string | null;
    customerNameSnapshot: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: {
      id: string;
      name: string | null;
      email: string;
    };
    customer?: {
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
      unitPrice: Prisma.Decimal;
      costPriceSnapshot: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      createdAt: Date;
    }>;
  },
): SaleDetailResponse {
  const customerName =
    sale.customerNameSnapshot ?? sale.customer?.name ?? null;

  return {
    id: sale.id,
    businessId: sale.businessId,
    receiptNumber: sale.receiptNumber,
    subtotal: formatMoney(sale.subtotal),
    discountAmount: formatMoney(sale.discountAmount),
    totalAmount: formatMoney(sale.totalAmount),
    amountPaid: formatMoney(sale.amountPaid),
    outstandingAmount: formatMoney(sale.outstandingAmount),
    paymentStatus: sale.paymentStatus,
    paymentMethod: sale.paymentMethod,
    status: sale.status,
    notes: sale.notes,
    customer:
      sale.customerId && customerName
        ? { id: sale.customerId, name: customerName }
        : null,
    createdBy: {
      id: sale.createdBy.id,
      name: sale.createdBy.name,
      email: sale.createdBy.email,
    },
    items: sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productNameSnapshot: item.productNameSnapshot,
      skuSnapshot: item.skuSnapshot,
      unitSnapshot: item.unitSnapshot,
      quantity: formatQuantity(item.quantity),
      unitPrice: formatMoney(item.unitPrice),
      costPriceSnapshot: formatMoney(item.costPriceSnapshot),
      lineSubtotal: formatMoney(item.lineSubtotal),
      createdAt: item.createdAt.toISOString(),
    })),
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
  };
}

export async function createSale(
  businessId: string,
  createdByUserId: string,
  input: CreateSaleInput,
): Promise<CreateSaleResponse> {
  if (input.items.length === 0) {
    throw new AppError(400, "At least one item is required", "EMPTY_SALE");
  }

  const normalizedItems = normalizeSaleItems(input.items);
  const discountAmount = toMoneyDecimalFromString(input.discountAmount ?? "0");

  const sale = await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: {
        id: {
          in: normalizedItems.map((item) => item.productId),
        },
      },
    });

    const productMap = new Map(products.map((product) => [product.id, product]));
    const preparedLines: PreparedSaleLine[] = [];

    for (const item of normalizedItems) {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      if (product.businessId !== businessId) {
        throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      if (!product.isActive) {
        throw new AppError(
          409,
          "Product is not available for sale",
          "PRODUCT_INACTIVE",
          {
            details: {
              productId: product.id,
              productName: product.name,
            },
          },
        );
      }

      const unitPrice = product.sellingPrice;
      const lineSubtotal = multiplyMoney(unitPrice, item.quantity);

      preparedLines.push({
        product,
        quantity: item.quantity,
        unitPrice,
        lineSubtotal,
      });
    }

    const lockedBalances = new Map<string, Awaited<ReturnType<typeof lockInventoryBalance>>>();

    for (const line of preparedLines) {
      const balance = await lockInventoryBalance(
        tx,
        businessId,
        line.product.id,
      );
      lockedBalances.set(line.product.id, balance);

      if (balance.quantity.lt(line.quantity)) {
        throw new AppError(
          409,
          "Insufficient stock for this sale",
          "INSUFFICIENT_STOCK",
          {
            details: {
              productId: line.product.id,
              productName: line.product.name,
              available: formatQuantity(balance.quantity),
              requested: formatQuantity(line.quantity),
            },
          },
        );
      }
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

    const amountPaid =
      input.amountPaid !== undefined
        ? toMoneyDecimalFromString(input.amountPaid)
        : totalAmount;

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

    if (outstandingAmount.gt(0) && !input.customerId) {
      throw new AppError(
        400,
        "Customer is required for credit sales",
        "CUSTOMER_REQUIRED_FOR_CREDIT",
      );
    }

    if (amountPaid.gt(0) && !input.paymentMethod) {
      throw new AppError(
        400,
        "Payment method is required when amount is paid",
        "VALIDATION_ERROR",
      );
    }

    let customerSnapshot: { id: string; name: string } | null = null;

    if (input.customerId) {
      const requireActive = outstandingAmount.gt(0);
      const customer = await assertCustomerInBusiness(
        businessId,
        input.customerId,
        { requireActive },
      );
      customerSnapshot = { id: customer.id, name: customer.name };
    }

    const paymentStatus = deriveSalePaymentStatus(
      amountPaid,
      outstandingAmount,
    );
    const receiptNumber = await generateReceiptNumber(tx, businessId);

    const createdSale = await tx.sale.create({
      data: {
        businessId,
        createdByUserId,
        customerId: customerSnapshot?.id ?? null,
        customerNameSnapshot: customerSnapshot?.name ?? null,
        receiptNumber,
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
            unitPrice: line.unitPrice,
            costPriceSnapshot: line.product.costPrice,
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
        customer: {
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

    if (outstandingAmount.gt(0) && customerSnapshot) {
      await tx.customerDebt.create({
        data: {
          businessId,
          customerId: customerSnapshot.id,
          saleId: createdSale.id,
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
      const quantityAfter = quantityBefore.sub(line.quantity);
      const quantityChange = line.quantity.negated();

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { quantity: quantityAfter },
      });

      await tx.inventoryTransaction.create({
        data: {
          businessId,
          productId: line.product.id,
          performedByUserId: createdByUserId,
          type: "SALE",
          quantityChange,
          quantityBefore,
          quantityAfter,
          reason: "Sale",
          referenceType: "SALE",
          referenceId: createdSale.id,
          notes: input.notes ?? null,
        },
      });
    }

    return createdSale;
  });

  return {
    sale: toSaleDetailResponse(sale),
  };
}

export async function listSales(businessId: string, query: ListSalesQuery) {
  const where = {
    businessId,
    ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
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

  const [total, sales] = await prisma.$transaction([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        customer: {
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
    items: sales.map(
      (sale): SaleListItem => ({
        id: sale.id,
        receiptNumber: sale.receiptNumber,
        totalAmount: formatMoney(sale.totalAmount),
        amountPaid: formatMoney(sale.amountPaid),
        outstandingAmount: formatMoney(sale.outstandingAmount),
        paymentStatus: sale.paymentStatus,
        paymentMethod: sale.paymentMethod,
        customer:
          sale.customerId && (sale.customerNameSnapshot ?? sale.customer?.name)
            ? {
                id: sale.customerId,
                name: sale.customerNameSnapshot ?? sale.customer!.name,
              }
            : null,
        createdBy: {
          id: sale.createdBy.id,
          name: sale.createdBy.name,
          email: sale.createdBy.email,
        },
        itemCount: sale._count.items,
        createdAt: sale.createdAt.toISOString(),
      }),
    ),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getSaleDetail(
  businessId: string,
  saleId: string,
): Promise<SaleDetailResponse> {
  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
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
      customer: {
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

  if (!sale) {
    throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
  }

  return toSaleDetailResponse(sale);
}
