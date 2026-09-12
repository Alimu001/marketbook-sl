import type {
  BusinessPayableListItem,
  SupplierPayableSummary,
  SupplierPaymentResponse,
  RecordSupplierPaymentResponse,
} from "@marketbook/shared/types";
import type {
  ListBusinessPayablesQuery,
  ListSupplierPayablesQuery,
  ListSupplierPaymentsQuery,
  RecordSupplierPaymentInput,
} from "@marketbook/shared/validation";
import type {
  DebtStatus,
  Prisma,
  SupplierPayable,
} from "../../../generated/prisma/client.js";
import {
  formatMoney,
  subtractMoney,
  toMoneyDecimalFromString,
} from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  deriveDebtStatus,
  deriveSalePaymentStatus,
} from "../debts/debt.service.js";
import { assertSupplierInBusiness } from "../suppliers/supplier.service.js";

type TransactionClient = Prisma.TransactionClient;

export async function lockSupplierPayable(
  tx: TransactionClient,
  businessId: string,
  payableId: string,
): Promise<SupplierPayable> {
  await tx.$executeRaw`
    SELECT "id"
    FROM "SupplierPayable"
    WHERE "id" = ${payableId}::uuid
      AND "businessId" = ${businessId}::uuid
    FOR UPDATE
  `;

  const payable = await tx.supplierPayable.findFirst({
    where: {
      id: payableId,
      businessId,
    },
  });

  if (!payable) {
    throw new AppError(404, "Payable not found", "PAYABLE_NOT_FOUND");
  }

  return payable;
}

function toPayableSummary(
  payable: SupplierPayable & { purchase: { purchaseNumber: string } },
): SupplierPayableSummary {
  return {
    id: payable.id,
    purchaseId: payable.purchaseId,
    purchaseNumber: payable.purchase.purchaseNumber,
    originalAmount: formatMoney(payable.originalAmount),
    amountPaid: formatMoney(payable.amountPaid),
    outstandingAmount: formatMoney(payable.outstandingAmount),
    status: payable.status as SupplierPayableSummary["status"],
    createdAt: payable.createdAt.toISOString(),
  };
}

function toPaymentResponse(
  payment: {
    id: string;
    amount: Prisma.Decimal;
    paymentMethod: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER";
    balanceBefore: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
    notes: string | null;
    createdAt: Date;
    recordedBy: {
      id: string;
      name: string | null;
      email: string;
    };
  },
): SupplierPaymentResponse {
  return {
    id: payment.id,
    amount: formatMoney(payment.amount),
    paymentMethod: payment.paymentMethod,
    balanceBefore: formatMoney(payment.balanceBefore),
    balanceAfter: formatMoney(payment.balanceAfter),
    notes: payment.notes,
    recordedBy: {
      id: payment.recordedBy.id,
      name: payment.recordedBy.name,
      email: payment.recordedBy.email,
    },
    createdAt: payment.createdAt.toISOString(),
  };
}

export async function listSupplierPayables(
  businessId: string,
  supplierId: string,
  query: ListSupplierPayablesQuery,
) {
  await assertSupplierInBusiness(businessId, supplierId);

  const where = {
    businessId,
    supplierId,
    ...(query.status ? { status: query.status as DebtStatus } : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, payables] = await prisma.$transaction([
    prisma.supplierPayable.count({ where }),
    prisma.supplierPayable.findMany({
      where,
      include: { purchase: { select: { purchaseNumber: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: payables.map(toPayableSummary),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function listBusinessPayables(
  businessId: string,
  query: ListBusinessPayablesQuery,
) {
  const where = {
    businessId,
    ...(query.status ? { status: query.status as DebtStatus } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.search
      ? {
          supplier: {
            name: { contains: query.search, mode: "insensitive" as const },
          },
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, payables] = await prisma.$transaction([
    prisma.supplierPayable.count({ where }),
    prisma.supplierPayable.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        purchase: { select: { purchaseNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: payables.map(
      (payable): BusinessPayableListItem => ({
        id: payable.id,
        supplier: payable.supplier,
        purchaseId: payable.purchaseId,
        purchaseNumber: payable.purchase.purchaseNumber,
        originalAmount: formatMoney(payable.originalAmount),
        amountPaid: formatMoney(payable.amountPaid),
        outstandingAmount: formatMoney(payable.outstandingAmount),
        status: payable.status as BusinessPayableListItem["status"],
        createdAt: payable.createdAt.toISOString(),
      }),
    ),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getPayableDetail(
  businessId: string,
  payableId: string,
): Promise<SupplierPayableSummary> {
  const payable = await prisma.supplierPayable.findFirst({
    where: { id: payableId, businessId },
    include: { purchase: { select: { purchaseNumber: true } } },
  });

  if (!payable) {
    throw new AppError(404, "Payable not found", "PAYABLE_NOT_FOUND");
  }

  return toPayableSummary(payable);
}

export async function recordSupplierPayment(
  businessId: string,
  payableId: string,
  recordedByUserId: string,
  input: RecordSupplierPaymentInput,
): Promise<RecordSupplierPaymentResponse> {
  const paymentAmount = toMoneyDecimalFromString(input.amount);

  const result = await prisma.$transaction(async (tx) => {
    const payable = await lockSupplierPayable(tx, businessId, payableId);

    if (payable.status === "PAID" || payable.outstandingAmount.lte(0)) {
      throw new AppError(
        409,
        "Payable is already fully paid",
        "PAYABLE_ALREADY_PAID",
      );
    }

    if (paymentAmount.lte(0)) {
      throw new AppError(400, "Invalid payment amount", "INVALID_PAYMENT_AMOUNT");
    }

    if (paymentAmount.gt(payable.outstandingAmount)) {
      throw new AppError(
        400,
        "Payment exceeds outstanding balance",
        "PAYMENT_EXCEEDS_OUTSTANDING",
      );
    }

    const balanceBefore = payable.outstandingAmount;
    const balanceAfter = subtractMoney(balanceBefore, paymentAmount);
    const newAmountPaid = payable.amountPaid.add(paymentAmount);
    const newStatus = deriveDebtStatus(balanceAfter, newAmountPaid);

    const payment = await tx.supplierPayment.create({
      data: {
        businessId,
        supplierId: payable.supplierId,
        payableId: payable.id,
        amount: paymentAmount,
        paymentMethod: input.paymentMethod,
        recordedByUserId,
        balanceBefore,
        balanceAfter,
        notes: input.notes ?? null,
      },
      include: {
        recordedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const updatedPayable = await tx.supplierPayable.update({
      where: { id: payable.id },
      data: {
        amountPaid: newAmountPaid,
        outstandingAmount: balanceAfter,
        status: newStatus,
      },
      include: { purchase: { select: { purchaseNumber: true } } },
    });

    const purchase = await tx.purchase.findUniqueOrThrow({
      where: { id: payable.purchaseId },
    });

    const newPurchaseAmountPaid = purchase.amountPaid.add(paymentAmount);
    const newPurchaseOutstanding = subtractMoney(
      purchase.totalAmount,
      newPurchaseAmountPaid,
    );

    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        amountPaid: newPurchaseAmountPaid,
        outstandingAmount: newPurchaseOutstanding,
        paymentStatus: deriveSalePaymentStatus(
          newPurchaseAmountPaid,
          newPurchaseOutstanding,
        ),
      },
    });

    return { payment, payable: updatedPayable };
  });

  return {
    payment: toPaymentResponse(result.payment),
    payable: toPayableSummary(result.payable),
  };
}

export async function listSupplierPayments(
  businessId: string,
  payableId: string,
  query: ListSupplierPaymentsQuery,
) {
  const payable = await prisma.supplierPayable.findFirst({
    where: { id: payableId, businessId },
    select: { id: true },
  });

  if (!payable) {
    throw new AppError(404, "Payable not found", "PAYABLE_NOT_FOUND");
  }

  const where = { businessId, payableId };
  const skip = (query.page - 1) * query.limit;

  const [total, payments] = await prisma.$transaction([
    prisma.supplierPayment.count({ where }),
    prisma.supplierPayment.findMany({
      where,
      include: {
        recordedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: payments.map(toPaymentResponse),
    page: query.page,
    limit: query.limit,
    total,
  };
}
