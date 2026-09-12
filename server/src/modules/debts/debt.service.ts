import type {
  BusinessDebtListItem,
  CustomerDebtSummary,
  DebtPaymentResponse,
  RecordDebtPaymentResponse,
} from "@marketbook/shared/types";
import type {
  ListBusinessDebtsQuery,
  ListCustomerDebtsQuery,
  ListDebtPaymentsQuery,
  RecordDebtPaymentInput,
} from "@marketbook/shared/validation";
import type {
  CustomerDebt,
  DebtStatus,
  Prisma,
  SalePaymentStatus,
} from "../../../generated/prisma/client.js";
import { formatMoney, subtractMoney, toMoneyDecimalFromString } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

type TransactionClient = Prisma.TransactionClient;

export function deriveSalePaymentStatus(
  amountPaid: Prisma.Decimal,
  outstandingAmount: Prisma.Decimal,
): SalePaymentStatus {
  if (outstandingAmount.lte(0)) {
    return "PAID";
  }

  if (amountPaid.lte(0)) {
    return "UNPAID";
  }

  return "PARTIALLY_PAID";
}

export function deriveDebtStatus(
  outstandingAmount: Prisma.Decimal,
  amountPaid: Prisma.Decimal,
): DebtStatus {
  if (outstandingAmount.lte(0)) {
    return "PAID";
  }

  if (amountPaid.lte(0)) {
    return "OPEN";
  }

  return "PARTIALLY_PAID";
}

export async function lockCustomerDebt(
  tx: TransactionClient,
  businessId: string,
  debtId: string,
): Promise<CustomerDebt> {
  await tx.$executeRaw`
    SELECT "id"
    FROM "CustomerDebt"
    WHERE "id" = ${debtId}::uuid
      AND "businessId" = ${businessId}::uuid
    FOR UPDATE
  `;

  const debt = await tx.customerDebt.findFirst({
    where: {
      id: debtId,
      businessId,
    },
  });

  if (!debt) {
    throw new AppError(404, "Debt not found", "DEBT_NOT_FOUND");
  }

  return debt;
}

function toDebtSummary(
  debt: CustomerDebt & { sale: { receiptNumber: string } },
): CustomerDebtSummary {
  return {
    id: debt.id,
    saleId: debt.saleId,
    receiptNumber: debt.sale.receiptNumber,
    originalAmount: formatMoney(debt.originalAmount),
    amountPaid: formatMoney(debt.amountPaid),
    outstandingAmount: formatMoney(debt.outstandingAmount),
    status: debt.status,
    createdAt: debt.createdAt.toISOString(),
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
): DebtPaymentResponse {
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

export async function listCustomerDebts(
  businessId: string,
  customerId: string,
  query: ListCustomerDebtsQuery,
) {
  const where = {
    businessId,
    customerId,
    ...(query.status ? { status: query.status } : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, debts] = await prisma.$transaction([
    prisma.customerDebt.count({ where }),
    prisma.customerDebt.findMany({
      where,
      include: { sale: { select: { receiptNumber: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: debts.map(toDebtSummary),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function listBusinessDebts(
  businessId: string,
  query: ListBusinessDebtsQuery,
) {
  const where = {
    businessId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.search
      ? {
          customer: {
            name: { contains: query.search, mode: "insensitive" as const },
          },
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [total, debts] = await prisma.$transaction([
    prisma.customerDebt.count({ where }),
    prisma.customerDebt.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        sale: { select: { receiptNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    items: debts.map(
      (debt): BusinessDebtListItem => ({
        id: debt.id,
        customer: debt.customer,
        saleId: debt.saleId,
        receiptNumber: debt.sale.receiptNumber,
        originalAmount: formatMoney(debt.originalAmount),
        amountPaid: formatMoney(debt.amountPaid),
        outstandingAmount: formatMoney(debt.outstandingAmount),
        status: debt.status,
        createdAt: debt.createdAt.toISOString(),
      }),
    ),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getDebtDetail(
  businessId: string,
  debtId: string,
): Promise<CustomerDebtSummary> {
  const debt = await prisma.customerDebt.findFirst({
    where: { id: debtId, businessId },
    include: { sale: { select: { receiptNumber: true } } },
  });

  if (!debt) {
    throw new AppError(404, "Debt not found", "DEBT_NOT_FOUND");
  }

  return toDebtSummary(debt);
}

export async function recordDebtPayment(
  businessId: string,
  debtId: string,
  recordedByUserId: string,
  input: RecordDebtPaymentInput,
): Promise<RecordDebtPaymentResponse> {
  const paymentAmount = toMoneyDecimalFromString(input.amount);

  const result = await prisma.$transaction(async (tx) => {
    const debt = await lockCustomerDebt(tx, businessId, debtId);

    if (debt.status === "PAID" || debt.outstandingAmount.lte(0)) {
      throw new AppError(409, "Debt is already fully paid", "DEBT_ALREADY_PAID");
    }

    if (paymentAmount.lte(0)) {
      throw new AppError(400, "Invalid payment amount", "INVALID_PAYMENT_AMOUNT");
    }

    if (paymentAmount.gt(debt.outstandingAmount)) {
      throw new AppError(
        400,
        "Payment exceeds outstanding balance",
        "PAYMENT_EXCEEDS_OUTSTANDING",
      );
    }

    const balanceBefore = debt.outstandingAmount;
    const balanceAfter = subtractMoney(balanceBefore, paymentAmount);
    const newAmountPaid = debt.amountPaid.add(paymentAmount);
    const newStatus = deriveDebtStatus(balanceAfter, newAmountPaid);

    const payment = await tx.debtPayment.create({
      data: {
        businessId,
        customerId: debt.customerId,
        debtId: debt.id,
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

    const updatedDebt = await tx.customerDebt.update({
      where: { id: debt.id },
      data: {
        amountPaid: newAmountPaid,
        outstandingAmount: balanceAfter,
        status: newStatus,
      },
      include: { sale: { select: { receiptNumber: true } } },
    });

    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: debt.saleId },
    });

    const newSaleAmountPaid = sale.amountPaid.add(paymentAmount);
    const newSaleOutstanding = subtractMoney(sale.totalAmount, newSaleAmountPaid);

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        amountPaid: newSaleAmountPaid,
        outstandingAmount: newSaleOutstanding,
        paymentStatus: deriveSalePaymentStatus(
          newSaleAmountPaid,
          newSaleOutstanding,
        ),
      },
    });

    return { payment, debt: updatedDebt };
  });

  return {
    payment: toPaymentResponse(result.payment),
    debt: toDebtSummary(result.debt),
  };
}

export async function listDebtPayments(
  businessId: string,
  debtId: string,
  query: ListDebtPaymentsQuery,
) {
  const debt = await prisma.customerDebt.findFirst({
    where: { id: debtId, businessId },
    select: { id: true },
  });

  if (!debt) {
    throw new AppError(404, "Debt not found", "DEBT_NOT_FOUND");
  }

  const where = { businessId, debtId };
  const skip = (query.page - 1) * query.limit;

  const [total, payments] = await prisma.$transaction([
    prisma.debtPayment.count({ where }),
    prisma.debtPayment.findMany({
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
