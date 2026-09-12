import type {
  CreateSupplierReturnResponse,
  PurchaseReturnSummary,
  SupplierReturnListItem,
  SupplierReturnResponse,
} from "@marketbook/shared/types";
import type {
  CreateSupplierReturnInput,
  ListSupplierReturnsQuery,
} from "@marketbook/shared/validation";
import type { PaymentMethod } from "../../../generated/prisma/client.js";
import { Prisma } from "../../../generated/prisma/client.js";
import {
  formatMoney,
  subtractMoney,
  sumMoney,
} from "../../lib/money.js";
import { formatQuantity, toQuantityDecimal } from "../../lib/quantity.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  deriveDebtStatus,
  deriveSalePaymentStatus,
} from "../debts/debt.service.js";
import { lockInventoryBalance } from "../inventory/inventory.service.js";
import { lockSupplierPayable } from "../payables/payable.service.js";
import { calculateLineReturnAmount } from "./refundCalculation.js";
import {
  generateSupplierReturnNumber,
  getReturnedQuantitiesByPurchaseItem,
  lockPurchase,
} from "./reversalLocks.js";

interface PreparedReturnLine {
  purchaseItemId: string;
  productId: string;
  quantity: Prisma.Decimal;
  unitCostSnapshot: Prisma.Decimal;
  lineReturnAmount: Prisma.Decimal;
}

function toSupplierReturnResponse(
  supplierReturn: {
    id: string;
    businessId: string;
    purchaseId: string;
    supplierId: string;
    returnNumber: string;
    returnAmount: Prisma.Decimal;
    payableReduction: Prisma.Decimal;
    cashRefundAmount: Prisma.Decimal;
    refundPaymentMethod: PaymentMethod | null;
    reason: string;
    notes: string | null;
    createdAt: Date;
    createdBy: {
      id: string;
      name: string | null;
      email: string;
    };
    items: Array<{
      id: string;
      purchaseItemId: string;
      productId: string;
      quantity: Prisma.Decimal;
      unitCostSnapshot: Prisma.Decimal;
      lineReturnAmount: Prisma.Decimal;
      createdAt: Date;
    }>;
  },
): SupplierReturnResponse {
  return {
    id: supplierReturn.id,
    businessId: supplierReturn.businessId,
    purchaseId: supplierReturn.purchaseId,
    supplierId: supplierReturn.supplierId,
    returnNumber: supplierReturn.returnNumber,
    returnAmount: formatMoney(supplierReturn.returnAmount),
    payableReduction: formatMoney(supplierReturn.payableReduction),
    cashRefundAmount: formatMoney(supplierReturn.cashRefundAmount),
    refundPaymentMethod: supplierReturn.refundPaymentMethod,
    reason: supplierReturn.reason,
    notes: supplierReturn.notes,
    createdBy: {
      id: supplierReturn.createdBy.id,
      name: supplierReturn.createdBy.name,
      email: supplierReturn.createdBy.email,
    },
    items: supplierReturn.items.map((item) => ({
      id: item.id,
      purchaseItemId: item.purchaseItemId,
      productId: item.productId,
      quantity: formatQuantity(item.quantity),
      unitCostSnapshot: formatMoney(item.unitCostSnapshot),
      lineReturnAmount: formatMoney(item.lineReturnAmount),
      createdAt: item.createdAt.toISOString(),
    })),
    createdAt: supplierReturn.createdAt.toISOString(),
  };
}

export async function createSupplierReturn(
  businessId: string,
  purchaseId: string,
  createdByUserId: string,
  input: CreateSupplierReturnInput,
): Promise<CreateSupplierReturnResponse> {
  const supplierReturn = await prisma.$transaction(async (tx) => {
    const purchase = await lockPurchase(tx, businessId, purchaseId);

    if (!purchase) {
      throw new AppError(404, "Purchase not found", "PURCHASE_NOT_FOUND");
    }

    if (purchase.status === "VOIDED" || purchase.void) {
      throw new AppError(
        409,
        "Purchase is voided",
        "PURCHASE_ALREADY_VOIDED",
      );
    }

    const returnedQuantities = await getReturnedQuantitiesByPurchaseItem(
      tx,
      purchaseId,
    );
    const purchaseItemMap = new Map(
      purchase.items.map((item) => [item.id, item]),
    );
    const preparedLines: PreparedReturnLine[] = [];

    const sortedInputItems = [...input.items].sort((left, right) =>
      left.purchaseItemId.localeCompare(right.purchaseItemId),
    );

    for (const requestItem of sortedInputItems) {
      const purchaseItem = purchaseItemMap.get(requestItem.purchaseItemId);

      if (!purchaseItem) {
        throw new AppError(
          404,
          "Purchase item not found",
          "PURCHASE_ITEM_NOT_FOUND",
          {
            details: { purchaseItemId: requestItem.purchaseItemId },
          },
        );
      }

      const returnQuantity = toQuantityDecimal(requestItem.quantity);
      const alreadyReturned =
        returnedQuantities.get(purchaseItem.id) ?? new Prisma.Decimal(0);
      const maxReturnable = purchaseItem.quantity.sub(alreadyReturned);

      if (returnQuantity.gt(maxReturnable)) {
        throw new AppError(
          409,
          "Return quantity exceeds returnable amount",
          "RETURN_QUANTITY_EXCEEDED",
          {
            details: {
              purchaseItemId: purchaseItem.id,
              purchased: formatQuantity(purchaseItem.quantity),
              alreadyReturned: formatQuantity(alreadyReturned),
              requested: formatQuantity(returnQuantity),
            },
          },
        );
      }

      const lineReturnAmount = calculateLineReturnAmount(
        purchase.subtotal,
        purchase.discountAmount,
        purchaseItem.lineSubtotal,
        purchaseItem.quantity,
        returnQuantity,
      );

      preparedLines.push({
        purchaseItemId: purchaseItem.id,
        productId: purchaseItem.productId,
        quantity: returnQuantity,
        unitCostSnapshot: purchaseItem.unitCost,
        lineReturnAmount,
      });
    }

    const returnAmount = sumMoney(
      preparedLines.map((line) => line.lineReturnAmount),
    );
    const remainingFinancial = purchase.totalAmount.sub(purchase.returnedAmount);

    if (returnAmount.gt(remainingFinancial)) {
      throw new AppError(
        409,
        "Return exceeds remaining returnable financial balance",
        "RETURN_QUANTITY_EXCEEDED",
        {
          details: {
            returnAmount: formatMoney(returnAmount),
            remainingReturnable: formatMoney(remainingFinancial),
          },
        },
      );
    }

    const sortedLines = [...preparedLines].sort((left, right) =>
      left.productId.localeCompare(right.productId),
    );

    const lockedBalances = new Map<
      string,
      Awaited<ReturnType<typeof lockInventoryBalance>>
    >();

    for (const line of sortedLines) {
      const balance = await lockInventoryBalance(
        tx,
        businessId,
        line.productId,
      );
      lockedBalances.set(line.productId, balance);

      if (balance.quantity.lt(line.quantity)) {
        throw new AppError(
          409,
          "Insufficient stock for supplier return",
          "INSUFFICIENT_STOCK_FOR_SUPPLIER_RETURN",
          {
            details: {
              productId: line.productId,
              available: formatQuantity(balance.quantity),
              requested: formatQuantity(line.quantity),
            },
          },
        );
      }
    }

    const payableReduction = Prisma.Decimal.min(
      returnAmount,
      purchase.outstandingAmount,
    );
    const cashRefundAmount = returnAmount.sub(payableReduction);

    if (cashRefundAmount.gt(0) && !input.refundPaymentMethod) {
      throw new AppError(
        400,
        "Refund payment method is required when supplier returns cash",
        "REFUND_PAYMENT_METHOD_REQUIRED",
      );
    }

    const returnNumber = await generateSupplierReturnNumber(tx, businessId);

    const createdReturn = await tx.supplierReturn.create({
      data: {
        businessId,
        purchaseId,
        supplierId: purchase.supplierId,
        returnNumber,
        returnAmount,
        payableReduction,
        cashRefundAmount,
        refundPaymentMethod:
          cashRefundAmount.gt(0) ? input.refundPaymentMethod! : null,
        reason: input.reason,
        notes: input.notes ?? null,
        createdByUserId,
        items: {
          create: preparedLines.map((line) => ({
            purchaseItemId: line.purchaseItemId,
            productId: line.productId,
            quantity: line.quantity,
            unitCostSnapshot: line.unitCostSnapshot,
            lineReturnAmount: line.lineReturnAmount,
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
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const newReturnedAmount = purchase.returnedAmount.add(returnAmount);
    const newOutstanding = purchase.outstandingAmount.sub(payableReduction);

    if (newOutstanding.isNegative()) {
      throw new AppError(
        409,
        "Return would make payable negative",
        "INVALID_SUPPLIER_RETURN",
      );
    }

    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        returnedAmount: newReturnedAmount,
        outstandingAmount: newOutstanding,
        paymentStatus: deriveSalePaymentStatus(
          purchase.amountPaid,
          newOutstanding,
        ),
      },
    });

    if (purchase.payable && payableReduction.gt(0)) {
      const payable = await lockSupplierPayable(
        tx,
        businessId,
        purchase.payable.id,
      );
      const payableOutstanding = payable.outstandingAmount.sub(payableReduction);

      await tx.supplierPayable.update({
        where: { id: payable.id },
        data: {
          outstandingAmount: payableOutstanding,
          status: deriveDebtStatus(payableOutstanding, payable.amountPaid),
        },
      });
    }

    for (const line of sortedLines) {
      const balance = lockedBalances.get(line.productId)!;
      const quantityBefore = balance.quantity;
      const quantityAfter = quantityBefore.sub(line.quantity);

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { quantity: quantityAfter },
      });

      await tx.inventoryTransaction.create({
        data: {
          businessId,
          productId: line.productId,
          performedByUserId: createdByUserId,
          type: "SUPPLIER_RETURN",
          quantityChange: line.quantity.negated(),
          quantityBefore,
          quantityAfter,
          reason: "Supplier return",
          referenceType: "SUPPLIER_RETURN",
          referenceId: createdReturn.id,
          notes: input.notes ?? null,
        },
      });
    }

    return createdReturn;
  });

  return { supplierReturn: toSupplierReturnResponse(supplierReturn) };
}

export async function listPurchaseReturns(
  businessId: string,
  purchaseId: string,
): Promise<SupplierReturnResponse[]> {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, businessId },
    select: { id: true },
  });

  if (!purchase) {
    throw new AppError(404, "Purchase not found", "PURCHASE_NOT_FOUND");
  }

  const returns = await prisma.supplierReturn.findMany({
    where: { businessId, purchaseId },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return returns.map(toSupplierReturnResponse);
}

export async function listBusinessSupplierReturns(
  businessId: string,
  query: ListSupplierReturnsQuery,
) {
  const where = {
    businessId,
    ...(query.purchaseId ? { purchaseId: query.purchaseId } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, returns] = await prisma.$transaction([
    prisma.supplierReturn.count({ where }),
    prisma.supplierReturn.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        purchase: {
          select: {
            purchaseNumber: true,
          },
        },
        supplier: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: returns.map(
      (entry): SupplierReturnListItem => ({
        id: entry.id,
        returnNumber: entry.returnNumber,
        purchaseId: entry.purchaseId,
        purchaseNumber: entry.purchase.purchaseNumber,
        supplierId: entry.supplierId,
        supplierName: entry.supplier.name,
        returnAmount: formatMoney(entry.returnAmount),
        reason: entry.reason,
        createdBy: {
          id: entry.createdBy.id,
          name: entry.createdBy.name,
          email: entry.createdBy.email,
        },
        createdAt: entry.createdAt.toISOString(),
      }),
    ),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getSupplierReturnDetail(
  businessId: string,
  returnId: string,
): Promise<SupplierReturnResponse> {
  const supplierReturn = await prisma.supplierReturn.findFirst({
    where: {
      id: returnId,
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
      items: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!supplierReturn) {
    throw new AppError(
      404,
      "Supplier return not found",
      "SUPPLIER_RETURN_NOT_FOUND",
    );
  }

  return toSupplierReturnResponse(supplierReturn);
}

export async function getPurchaseReturnSummary(
  businessId: string,
  purchaseId: string,
): Promise<PurchaseReturnSummary> {
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, businessId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
      },
      returns: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          returnNumber: true,
          returnAmount: true,
          reason: true,
          createdAt: true,
        },
      },
    },
  });

  if (!purchase) {
    throw new AppError(404, "Purchase not found", "PURCHASE_NOT_FOUND");
  }

  const returnedQuantities = await prisma.supplierReturnItem.groupBy({
    by: ["purchaseItemId"],
    where: {
      supplierReturn: {
        purchaseId,
        businessId,
      },
    },
    _sum: {
      quantity: true,
    },
  });

  const returnedMap = new Map(
    returnedQuantities.map((row) => [
      row.purchaseItemId,
      row._sum.quantity ?? new Prisma.Decimal(0),
    ]),
  );

  const productIds = purchase.items.map((item) => item.productId);
  const balances = await prisma.inventoryBalance.findMany({
    where: {
      businessId,
      productId: { in: productIds },
    },
  });
  const balanceMap = new Map(
    balances.map((balance) => [balance.productId, balance.quantity]),
  );

  const effectivePurchaseTotal = subtractMoney(
    purchase.totalAmount,
    purchase.returnedAmount,
  );
  const remainingReturnableAmount = subtractMoney(
    purchase.totalAmount,
    purchase.returnedAmount,
  );

  return {
    returnedAmount: formatMoney(purchase.returnedAmount),
    effectivePurchaseTotal: formatMoney(effectivePurchaseTotal),
    remainingReturnableAmount: formatMoney(remainingReturnableAmount),
    returns: purchase.returns.map((entry) => ({
      id: entry.id,
      returnNumber: entry.returnNumber,
      returnAmount: formatMoney(entry.returnAmount),
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
    })),
    items: purchase.items.map((item) => {
      const returnedQuantity =
        returnedMap.get(item.id) ?? new Prisma.Decimal(0);
      const returnableQuantity = item.quantity.sub(returnedQuantity);
      const currentStock =
        balanceMap.get(item.productId) ?? new Prisma.Decimal(0);
      const maxReturnableNow = Prisma.Decimal.min(
        returnableQuantity,
        currentStock,
      );
      const estimatedPerUnit = calculateLineReturnAmount(
        purchase.subtotal,
        purchase.discountAmount,
        item.lineSubtotal,
        item.quantity,
        new Prisma.Decimal(1),
      );

      return {
        purchaseItemId: item.id,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        purchasedQuantity: formatQuantity(item.quantity),
        returnedQuantity: formatQuantity(returnedQuantity),
        returnableQuantity: formatQuantity(returnableQuantity),
        currentStock: formatQuantity(currentStock),
        maxReturnableNow: formatQuantity(maxReturnableNow),
        unitCost: formatMoney(item.unitCost),
        estimatedLineReturnPerUnit: formatMoney(estimatedPerUnit),
      };
    }),
  };
}
