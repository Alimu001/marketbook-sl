import type {
  CreatePurchaseVoidResponse,
  CreateSaleVoidResponse,
  PurchaseVoidResponse,
  SaleVoidResponse,
} from "@marketbook/shared/types";
import type {
  PurchaseVoidInput,
  SaleVoidInput,
} from "@marketbook/shared/validation";
import { Prisma } from "../../../generated/prisma/client.js";
import { formatQuantity } from "../../lib/quantity.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  deriveSalePaymentStatus,
  lockCustomerDebt,
} from "../debts/debt.service.js";
import { lockInventoryBalance } from "../inventory/inventory.service.js";
import { lockSupplierPayable } from "../payables/payable.service.js";
import { lockPurchase, lockSale } from "./reversalLocks.js";

function toSaleVoidResponse(
  voidRecord: {
    id: string;
    businessId: string;
    saleId: string;
    reason: string;
    notes: string | null;
    createdAt: Date;
    createdBy: {
      id: string;
      name: string | null;
      email: string;
    };
  },
): SaleVoidResponse {
  return {
    id: voidRecord.id,
    businessId: voidRecord.businessId,
    saleId: voidRecord.saleId,
    reason: voidRecord.reason,
    notes: voidRecord.notes,
    createdBy: {
      id: voidRecord.createdBy.id,
      name: voidRecord.createdBy.name,
      email: voidRecord.createdBy.email,
    },
    createdAt: voidRecord.createdAt.toISOString(),
  };
}

function toPurchaseVoidResponse(
  voidRecord: {
    id: string;
    businessId: string;
    purchaseId: string;
    reason: string;
    notes: string | null;
    createdAt: Date;
    createdBy: {
      id: string;
      name: string | null;
      email: string;
    };
  },
): PurchaseVoidResponse {
  return {
    id: voidRecord.id,
    businessId: voidRecord.businessId,
    purchaseId: voidRecord.purchaseId,
    reason: voidRecord.reason,
    notes: voidRecord.notes,
    createdBy: {
      id: voidRecord.createdBy.id,
      name: voidRecord.createdBy.name,
      email: voidRecord.createdBy.email,
    },
    createdAt: voidRecord.createdAt.toISOString(),
  };
}

export async function voidSale(
  businessId: string,
  saleId: string,
  createdByUserId: string,
  input: SaleVoidInput,
): Promise<CreateSaleVoidResponse> {
  const result = await prisma.$transaction(async (tx) => {
    const sale = await lockSale(tx, businessId, saleId);

    if (!sale) {
      throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
    }

    if (sale.status === "VOIDED" || sale.void) {
      throw new AppError(409, "Sale is already voided", "SALE_ALREADY_VOIDED");
    }

    if (sale.refundedAmount.gt(0)) {
      throw new AppError(
        409,
        "Sale has partial refunds and cannot be voided",
        "SALE_ALREADY_PARTIALLY_REFUNDED",
      );
    }

    if (sale.debt && sale.debt.amountPaid.gt(0)) {
      throw new AppError(
        409,
        "Sale has debt payments and cannot be voided",
        "SALE_HAS_PAYMENTS_REQUIRING_REFUND",
      );
    }

    if (sale.amountPaid.gt(0) && !sale.debt) {
      throw new AppError(
        409,
        "Paid sale cannot be voided without refund workflow",
        "SALE_HAS_PAYMENTS_REQUIRING_REFUND",
      );
    }

    const voidRecord = await tx.saleVoid.create({
      data: {
        businessId,
        saleId,
        reason: input.reason,
        notes: input.notes ?? null,
        createdByUserId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: "VOIDED",
        outstandingAmount: new Prisma.Decimal(0),
        paymentStatus: deriveSalePaymentStatus(
          sale.amountPaid,
          new Prisma.Decimal(0),
        ),
      },
    });

    if (sale.debt) {
      const debt = await lockCustomerDebt(tx, businessId, sale.debt.id);

      await tx.customerDebt.update({
        where: { id: debt.id },
        data: {
          outstandingAmount: new Prisma.Decimal(0),
          status: "VOIDED",
        },
      });
    }

    const sortedItems = [...sale.items].sort((left, right) =>
      left.productId.localeCompare(right.productId),
    );

    for (const item of sortedItems) {
      const balance = await lockInventoryBalance(
        tx,
        businessId,
        item.productId,
      );
      const quantityBefore = balance.quantity;
      const quantityAfter = quantityBefore.add(item.quantity);

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { quantity: quantityAfter },
      });

      await tx.inventoryTransaction.create({
        data: {
          businessId,
          productId: item.productId,
          performedByUserId: createdByUserId,
          type: "SALE_VOID",
          quantityChange: item.quantity,
          quantityBefore,
          quantityAfter,
          reason: "Sale void restock",
          referenceType: "SALE_VOID",
          referenceId: voidRecord.id,
          notes: input.notes ?? null,
        },
      });
    }

    return {
      void: voidRecord,
      receiptNumber: sale.receiptNumber,
    };
  });

  return {
    void: toSaleVoidResponse(result.void),
    sale: {
      id: saleId,
      status: "VOIDED",
      receiptNumber: result.receiptNumber,
    },
  };
}

export async function getSaleVoid(
  businessId: string,
  saleId: string,
): Promise<SaleVoidResponse> {
  const voidRecord = await prisma.saleVoid.findFirst({
    where: {
      businessId,
      saleId,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!voidRecord) {
    throw new AppError(404, "Sale void not found", "SALE_NOT_FOUND");
  }

  return toSaleVoidResponse(voidRecord);
}

export async function voidPurchase(
  businessId: string,
  purchaseId: string,
  createdByUserId: string,
  input: PurchaseVoidInput,
): Promise<CreatePurchaseVoidResponse> {
  const result = await prisma.$transaction(async (tx) => {
    const purchase = await lockPurchase(tx, businessId, purchaseId);

    if (!purchase) {
      throw new AppError(404, "Purchase not found", "PURCHASE_NOT_FOUND");
    }

    if (purchase.status === "VOIDED" || purchase.void) {
      throw new AppError(
        409,
        "Purchase is already voided",
        "PURCHASE_ALREADY_VOIDED",
      );
    }

    if (purchase.payable && purchase.payable.amountPaid.gt(0)) {
      throw new AppError(
        409,
        "Purchase has supplier payments and cannot be voided",
        "PURCHASE_HAS_PAYMENTS",
      );
    }

    if (purchase.amountPaid.gt(0) && !purchase.payable) {
      throw new AppError(
        409,
        "Paid purchase cannot be voided",
        "PURCHASE_HAS_PAYMENTS",
      );
    }

    const sortedItems = [...purchase.items].sort((left, right) =>
      left.productId.localeCompare(right.productId),
    );

    const lockedBalances = new Map<
      string,
      Awaited<ReturnType<typeof lockInventoryBalance>>
    >();

    for (const item of sortedItems) {
      const balance = await lockInventoryBalance(
        tx,
        businessId,
        item.productId,
      );
      lockedBalances.set(item.productId, balance);

      if (balance.quantity.lt(item.quantity)) {
        throw new AppError(
          409,
          "Insufficient stock to void purchase",
          "INSUFFICIENT_STOCK_FOR_PURCHASE_VOID",
          {
            details: {
              productId: item.productId,
              productName: item.productNameSnapshot,
              available: formatQuantity(balance.quantity),
              required: formatQuantity(item.quantity),
            },
          },
        );
      }
    }

    const voidRecord = await tx.purchaseVoid.create({
      data: {
        businessId,
        purchaseId,
        reason: input.reason,
        notes: input.notes ?? null,
        createdByUserId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        status: "VOIDED",
        outstandingAmount: new Prisma.Decimal(0),
        paymentStatus: deriveSalePaymentStatus(
          purchase.amountPaid,
          new Prisma.Decimal(0),
        ),
      },
    });

    if (purchase.payable) {
      const payable = await lockSupplierPayable(
        tx,
        businessId,
        purchase.payable.id,
      );

      await tx.supplierPayable.update({
        where: { id: payable.id },
        data: {
          outstandingAmount: new Prisma.Decimal(0),
          status: "VOIDED",
        },
      });
    }

    for (const item of sortedItems) {
      const balance = lockedBalances.get(item.productId)!;
      const quantityBefore = balance.quantity;
      const quantityAfter = quantityBefore.sub(item.quantity);

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { quantity: quantityAfter },
      });

      await tx.inventoryTransaction.create({
        data: {
          businessId,
          productId: item.productId,
          performedByUserId: createdByUserId,
          type: "PURCHASE_VOID",
          quantityChange: item.quantity.negated(),
          quantityBefore,
          quantityAfter,
          reason: "Purchase void",
          referenceType: "PURCHASE_VOID",
          referenceId: voidRecord.id,
          notes: input.notes ?? null,
        },
      });
    }

    return {
      void: voidRecord,
      purchaseNumber: purchase.purchaseNumber,
    };
  });

  return {
    void: toPurchaseVoidResponse(result.void),
    purchase: {
      id: purchaseId,
      status: "VOIDED",
      purchaseNumber: result.purchaseNumber,
    },
  };
}

export async function getPurchaseVoid(
  businessId: string,
  purchaseId: string,
): Promise<PurchaseVoidResponse> {
  const voidRecord = await prisma.purchaseVoid.findFirst({
    where: {
      businessId,
      purchaseId,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!voidRecord) {
    throw new AppError(404, "Purchase void not found", "PURCHASE_NOT_FOUND");
  }

  return toPurchaseVoidResponse(voidRecord);
}
