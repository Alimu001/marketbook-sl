import type {
  CreateSaleRefundResponse,
  SaleRefundListItem,
  SaleRefundResponse,
  SaleReversalSummary,
} from "@marketbook/shared/types";
import type {
  CreateSaleRefundInput,
  ListRefundsQuery,
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
  lockCustomerDebt,
} from "../debts/debt.service.js";
import { lockInventoryBalance } from "../inventory/inventory.service.js";
import { calculateLineRefundAmount } from "./refundCalculation.js";
import {
  generateRefundNumber,
  getRefundedQuantitiesBySaleItem,
  lockSale,
} from "./reversalLocks.js";

interface PreparedRefundLine {
  saleItemId: string;
  productId: string;
  quantity: Prisma.Decimal;
  unitPriceSnapshot: Prisma.Decimal;
  costPriceSnapshot: Prisma.Decimal;
  lineRefundAmount: Prisma.Decimal;
  restock: boolean;
}

function toRefundResponse(
  refund: {
    id: string;
    businessId: string;
    saleId: string;
    refundNumber: string;
    refundAmount: Prisma.Decimal;
    receivableReduction: Prisma.Decimal;
    cashReturnAmount: Prisma.Decimal;
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
      saleItemId: string;
      productId: string;
      quantity: Prisma.Decimal;
      unitPriceSnapshot: Prisma.Decimal;
      costPriceSnapshot: Prisma.Decimal;
      lineRefundAmount: Prisma.Decimal;
      restock: boolean;
      createdAt: Date;
    }>;
  },
): SaleRefundResponse {
  return {
    id: refund.id,
    businessId: refund.businessId,
    saleId: refund.saleId,
    refundNumber: refund.refundNumber,
    refundAmount: formatMoney(refund.refundAmount),
    receivableReduction: formatMoney(refund.receivableReduction),
    cashReturnAmount: formatMoney(refund.cashReturnAmount),
    refundPaymentMethod: refund.refundPaymentMethod,
    reason: refund.reason,
    notes: refund.notes,
    createdBy: {
      id: refund.createdBy.id,
      name: refund.createdBy.name,
      email: refund.createdBy.email,
    },
    items: refund.items.map((item) => ({
      id: item.id,
      saleItemId: item.saleItemId,
      productId: item.productId,
      quantity: formatQuantity(item.quantity),
      unitPriceSnapshot: formatMoney(item.unitPriceSnapshot),
      costPriceSnapshot: formatMoney(item.costPriceSnapshot),
      lineRefundAmount: formatMoney(item.lineRefundAmount),
      restock: item.restock,
      createdAt: item.createdAt.toISOString(),
    })),
    createdAt: refund.createdAt.toISOString(),
  };
}

export async function createSaleRefund(
  businessId: string,
  saleId: string,
  createdByUserId: string,
  input: CreateSaleRefundInput,
): Promise<CreateSaleRefundResponse> {
  const refund = await prisma.$transaction(async (tx) => {
    const sale = await lockSale(tx, businessId, saleId);

    if (!sale) {
      throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
    }

    if (sale.status === "VOIDED" || sale.void) {
      throw new AppError(409, "Sale is voided", "SALE_ALREADY_VOIDED");
    }

    const refundedQuantities = await getRefundedQuantitiesBySaleItem(tx, saleId);
    const saleItemMap = new Map(sale.items.map((item) => [item.id, item]));
    const preparedLines: PreparedRefundLine[] = [];

    const sortedInputItems = [...input.items].sort((left, right) =>
      left.saleItemId.localeCompare(right.saleItemId),
    );

    for (const requestItem of sortedInputItems) {
      const saleItem = saleItemMap.get(requestItem.saleItemId);

      if (!saleItem) {
        throw new AppError(404, "Sale item not found", "SALE_ITEM_NOT_FOUND", {
          details: { saleItemId: requestItem.saleItemId },
        });
      }

      const refundQuantity = toQuantityDecimal(requestItem.quantity);
      const alreadyRefunded =
        refundedQuantities.get(saleItem.id) ?? new Prisma.Decimal(0);
      const maxRefundable = saleItem.quantity.sub(alreadyRefunded);

      if (refundQuantity.gt(maxRefundable)) {
        throw new AppError(
          409,
          "Refund quantity exceeds refundable amount",
          "REFUND_QUANTITY_EXCEEDED",
          {
            details: {
              saleItemId: saleItem.id,
              sold: formatQuantity(saleItem.quantity),
              alreadyRefunded: formatQuantity(alreadyRefunded),
              requested: formatQuantity(refundQuantity),
            },
          },
        );
      }

      const lineRefundAmount = calculateLineRefundAmount(
        sale.subtotal,
        sale.discountAmount,
        saleItem.lineSubtotal,
        saleItem.quantity,
        refundQuantity,
      );

      preparedLines.push({
        saleItemId: saleItem.id,
        productId: saleItem.productId,
        quantity: refundQuantity,
        unitPriceSnapshot: saleItem.unitPrice,
        costPriceSnapshot: saleItem.costPriceSnapshot,
        lineRefundAmount,
        restock: requestItem.restock,
      });
    }

    const refundAmount = sumMoney(preparedLines.map((line) => line.lineRefundAmount));
    const remainingFinancial = sale.totalAmount.sub(sale.refundedAmount);

    if (refundAmount.gt(remainingFinancial)) {
      throw new AppError(
        409,
        "Refund exceeds remaining refundable financial balance",
        "REFUND_EXCEEDS_AVAILABLE_FINANCIAL_BALANCE",
        {
          details: {
            refundAmount: formatMoney(refundAmount),
            remainingRefundable: formatMoney(remainingFinancial),
          },
        },
      );
    }

    const receivableReduction = Prisma.Decimal.min(
      refundAmount,
      sale.outstandingAmount,
    );
    const cashReturnAmount = refundAmount.sub(receivableReduction);

    if (cashReturnAmount.gt(0) && !input.refundPaymentMethod) {
      throw new AppError(
        400,
        "Refund payment method is required when returning collected money",
        "SALE_HAS_PAYMENTS_REQUIRING_REFUND",
      );
    }

    const refundNumber = await generateRefundNumber(tx, businessId);

    const createdRefund = await tx.saleRefund.create({
      data: {
        businessId,
        saleId,
        refundNumber,
        refundAmount,
        receivableReduction,
        cashReturnAmount,
        refundPaymentMethod:
          cashReturnAmount.gt(0) ? input.refundPaymentMethod! : null,
        reason: input.reason,
        notes: input.notes ?? null,
        createdByUserId,
        items: {
          create: preparedLines.map((line) => ({
            saleItemId: line.saleItemId,
            productId: line.productId,
            quantity: line.quantity,
            unitPriceSnapshot: line.unitPriceSnapshot,
            costPriceSnapshot: line.costPriceSnapshot,
            lineRefundAmount: line.lineRefundAmount,
            restock: line.restock,
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

    const newRefundedAmount = sale.refundedAmount.add(refundAmount);
    const newOutstanding = sale.outstandingAmount.sub(receivableReduction);
    const newAmountPaid = sale.amountPaid.sub(cashReturnAmount);

    if (newOutstanding.isNegative()) {
      throw new AppError(
        409,
        "Refund would make receivable negative",
        "REFUND_EXCEEDS_AVAILABLE_FINANCIAL_BALANCE",
      );
    }

    if (newAmountPaid.isNegative()) {
      throw new AppError(
        409,
        "Refund would make amount paid negative",
        "REFUND_EXCEEDS_AVAILABLE_FINANCIAL_BALANCE",
      );
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        refundedAmount: newRefundedAmount,
        outstandingAmount: newOutstanding,
        amountPaid: newAmountPaid,
        paymentStatus: deriveSalePaymentStatus(newAmountPaid, newOutstanding),
      },
    });

    if (sale.debt && receivableReduction.gt(0)) {
      const debt = await lockCustomerDebt(tx, businessId, sale.debt.id);
      const debtOutstanding = debt.outstandingAmount.sub(receivableReduction);

      await tx.customerDebt.update({
        where: { id: debt.id },
        data: {
          outstandingAmount: debtOutstanding,
          status: deriveDebtStatus(debtOutstanding, debt.amountPaid),
        },
      });
    }

    const restockLines = preparedLines
      .filter((line) => line.restock)
      .sort((left, right) => left.productId.localeCompare(right.productId));

    for (const line of restockLines) {
      const balance = await lockInventoryBalance(
        tx,
        businessId,
        line.productId,
      );
      const quantityBefore = balance.quantity;
      const quantityAfter = quantityBefore.add(line.quantity);

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { quantity: quantityAfter },
      });

      await tx.inventoryTransaction.create({
        data: {
          businessId,
          productId: line.productId,
          performedByUserId: createdByUserId,
          type: "SALE_REFUND",
          quantityChange: line.quantity,
          quantityBefore,
          quantityAfter,
          reason: "Sale refund restock",
          referenceType: "SALE_REFUND",
          referenceId: createdRefund.id,
          notes: input.notes ?? null,
        },
      });
    }

    return createdRefund;
  });

  return { refund: toRefundResponse(refund) };
}

export async function listSaleRefunds(
  businessId: string,
  saleId: string,
): Promise<SaleRefundResponse[]> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId },
    select: { id: true },
  });

  if (!sale) {
    throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
  }

  const refunds = await prisma.saleRefund.findMany({
    where: { businessId, saleId },
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

  return refunds.map(toRefundResponse);
}

export async function listBusinessRefunds(
  businessId: string,
  query: ListRefundsQuery,
) {
  const where = {
    businessId,
    ...(query.saleId ? { saleId: query.saleId } : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, refunds] = await prisma.$transaction([
    prisma.saleRefund.count({ where }),
    prisma.saleRefund.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        sale: {
          select: {
            receiptNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: refunds.map(
      (refund): SaleRefundListItem => ({
        id: refund.id,
        refundNumber: refund.refundNumber,
        saleId: refund.saleId,
        receiptNumber: refund.sale.receiptNumber,
        refundAmount: formatMoney(refund.refundAmount),
        reason: refund.reason,
        createdBy: {
          id: refund.createdBy.id,
          name: refund.createdBy.name,
          email: refund.createdBy.email,
        },
        createdAt: refund.createdAt.toISOString(),
      }),
    ),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getSaleRefundDetail(
  businessId: string,
  refundId: string,
): Promise<SaleRefundResponse> {
  const refund = await prisma.saleRefund.findFirst({
    where: {
      id: refundId,
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

  if (!refund) {
    throw new AppError(404, "Refund not found", "REFUND_NOT_FOUND");
  }

  return toRefundResponse(refund);
}

export async function getSaleReversalSummary(
  businessId: string,
  saleId: string,
): Promise<SaleReversalSummary> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
      },
      refunds: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          refundNumber: true,
          refundAmount: true,
          reason: true,
          createdAt: true,
        },
      },
    },
  });

  if (!sale) {
    throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
  }

  const refundedQuantities = await prisma.saleRefundItem.groupBy({
    by: ["saleItemId"],
    where: {
      refund: {
        saleId,
        businessId,
      },
    },
    _sum: {
      quantity: true,
    },
  });

  const refundedMap = new Map(
    refundedQuantities.map((row) => [
      row.saleItemId,
      row._sum.quantity ?? new Prisma.Decimal(0),
    ]),
  );

  const remainingRefundableAmount = subtractMoney(
    sale.totalAmount,
    sale.refundedAmount,
  );

  return {
    refundedAmount: formatMoney(sale.refundedAmount),
    remainingRefundableAmount: formatMoney(remainingRefundableAmount),
    isFullyRefunded: sale.refundedAmount.gte(sale.totalAmount),
    refunds: sale.refunds.map((refund) => ({
      id: refund.id,
      refundNumber: refund.refundNumber,
      refundAmount: formatMoney(refund.refundAmount),
      reason: refund.reason,
      createdAt: refund.createdAt.toISOString(),
    })),
    items: sale.items.map((item) => {
      const refundedQuantity =
        refundedMap.get(item.id) ?? new Prisma.Decimal(0);
      const refundableQuantity = item.quantity.sub(refundedQuantity);
      const estimatedPerUnit = calculateLineRefundAmount(
        sale.subtotal,
        sale.discountAmount,
        item.lineSubtotal,
        item.quantity,
        new Prisma.Decimal(1),
      );

      return {
        saleItemId: item.id,
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        soldQuantity: formatQuantity(item.quantity),
        refundedQuantity: formatQuantity(refundedQuantity),
        refundableQuantity: formatQuantity(refundableQuantity),
        unitPrice: formatMoney(item.unitPrice),
        estimatedLineRefundPerUnit: formatMoney(estimatedPerUnit),
      };
    }),
  };
}
