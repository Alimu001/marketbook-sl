import type {
  CustomerDetail,
  CustomerHistoryResponse,
  CustomerSummary,
} from "@marketbook/shared/types";
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "@marketbook/shared/validation";
import type { Customer, Prisma } from "../../../generated/prisma/client.js";
import { Prisma as PrismaNamespace } from "../../../generated/prisma/client.js";
import { executeIdempotentMutation } from "../../lib/clientMutation.js";
import { formatMoney } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import { getWalletBalanceMap } from "../wallet/wallet.service.js";

async function getOutstandingBalanceMap(
  businessId: string,
  customerIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  if (customerIds.length === 0) {
    return new Map();
  }

  const aggregates = await prisma.customerDebt.groupBy({
    by: ["customerId"],
    where: {
      businessId,
      customerId: { in: customerIds },
      status: { in: ["OPEN", "PARTIALLY_PAID"] },
    },
    _sum: {
      outstandingAmount: true,
    },
  });

  return new Map(
    aggregates.map((entry) => [
      entry.customerId,
      entry._sum.outstandingAmount ?? new PrismaNamespace.Decimal(0),
    ]),
  );
}

async function getOutstandingBalance(
  businessId: string,
  customerId: string,
): Promise<Prisma.Decimal> {
  const map = await getOutstandingBalanceMap(businessId, [customerId]);

  return map.get(customerId) ?? new PrismaNamespace.Decimal(0);
}

async function getOpenDebtCount(
  businessId: string,
  customerId: string,
): Promise<number> {
  return prisma.customerDebt.count({
    where: {
      businessId,
      customerId,
      status: { in: ["OPEN", "PARTIALLY_PAID"] },
    },
  });
}

function toCustomerSummary(
  customer: Customer,
  outstandingBalance: Prisma.Decimal,
  walletBalance: Prisma.Decimal,
): CustomerSummary {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    isActive: customer.isActive,
    outstandingBalance: formatMoney(outstandingBalance),
    walletBalance: formatMoney(walletBalance),
    createdAt: customer.createdAt.toISOString(),
  };
}

function toCustomerDetail(
  customer: Customer,
  outstandingBalance: Prisma.Decimal,
  walletBalance: Prisma.Decimal,
  openDebtCount: number,
): CustomerDetail {
  return {
    id: customer.id,
    businessId: customer.businessId,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    notes: customer.notes,
    isActive: customer.isActive,
    outstandingBalance: formatMoney(outstandingBalance),
    walletBalance: formatMoney(walletBalance),
    openDebtCount,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

export async function assertCustomerInBusiness(
  businessId: string,
  customerId: string,
  options: { requireActive?: boolean } = {},
): Promise<Customer> {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      businessId,
    },
  });

  if (!customer) {
    throw new AppError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }

  if (options.requireActive && !customer.isActive) {
    throw new AppError(
      409,
      "Customer is archived and cannot be used",
      "CUSTOMER_INACTIVE",
    );
  }

  return customer;
}

export async function createCustomer(
  businessId: string,
  userId: string,
  input: CreateCustomerInput,
  options: { mutationId?: string | undefined } = {},
): Promise<CustomerDetail> {
  return executeIdempotentMutation({
    businessId,
    userId,
    mutationId: options.mutationId,
    entityType: "CUSTOMER",
    payload: input,
    execute: async () => {
      const customer = await prisma.customer.create({
        data: {
          businessId,
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
        },
      });

      const detail = toCustomerDetail(
        customer,
        new PrismaNamespace.Decimal(0),
        new PrismaNamespace.Decimal(0),
        0,
      );

      return {
        entityId: customer.id,
        result: detail,
      };
    },
    loadExisting: (customerId) =>
      getCustomerDetail(businessId, customerId),
  });
}

export async function listCustomers(
  businessId: string,
  query: ListCustomersQuery,
) {
  const where = {
    businessId,
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
              phone: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
            {
              email: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  if (query.hasDebt !== undefined) {
    const customers = await prisma.customer.findMany({
      where,
      orderBy: [{ name: "asc" }],
    });

    const balanceMap = await getOutstandingBalanceMap(
      businessId,
      customers.map((customer) => customer.id),
    );

    const walletMap = await getWalletBalanceMap(
      businessId,
      customers.map((customer) => customer.id),
    );

    const filtered = customers.filter((customer) => {
      const balance =
        balanceMap.get(customer.id) ?? new PrismaNamespace.Decimal(0);

      return query.hasDebt ? balance.gt(0) : balance.lte(0);
    });

    const pageItems = filtered.slice(skip, skip + query.limit);

    return {
      items: pageItems.map((customer) =>
        toCustomerSummary(
          customer,
          balanceMap.get(customer.id) ?? new PrismaNamespace.Decimal(0),
          walletMap.get(customer.id) ?? new PrismaNamespace.Decimal(0),
        ),
      ),
      page: query.page,
      limit: query.limit,
      total: filtered.length,
    };
  }

  const [total, customers] = await prisma.$transaction([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip,
      take: query.limit,
    }),
  ]);

  const balanceMap = await getOutstandingBalanceMap(
    businessId,
    customers.map((customer) => customer.id),
  );

  const walletMap = await getWalletBalanceMap(
    businessId,
    customers.map((customer) => customer.id),
  );

  return {
    items: customers.map((customer) =>
      toCustomerSummary(
        customer,
        balanceMap.get(customer.id) ?? new PrismaNamespace.Decimal(0),
        walletMap.get(customer.id) ?? new PrismaNamespace.Decimal(0),
      ),
    ),
    page: query.page,
    limit: query.limit,
    total,
  };
}

async function buildCustomerDetail(
  customer: Customer,
  businessId: string,
): Promise<CustomerDetail> {
  const outstandingBalance = await getOutstandingBalance(
    businessId,
    customer.id,
  );

  const walletMap = await getWalletBalanceMap(
    businessId,
    [customer.id],
  );

  const openDebtCount = await getOpenDebtCount(
    businessId,
    customer.id,
  );

  return toCustomerDetail(
    customer,
    outstandingBalance,
    walletMap.get(customer.id) ?? new PrismaNamespace.Decimal(0),
    openDebtCount,
  );
}

export async function getCustomerDetail(
  businessId: string,
  customerId: string,
): Promise<CustomerDetail> {
  const customer = await assertCustomerInBusiness(
    businessId,
    customerId,
  );

  return buildCustomerDetail(customer, businessId);
}

export async function updateCustomer(
  businessId: string,
  customerId: string,
  input: UpdateCustomerInput,
): Promise<CustomerDetail> {
  await assertCustomerInBusiness(businessId, customerId);

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone ?? null }
        : {}),
      ...(input.email !== undefined
        ? { email: input.email ?? null }
        : {}),
      ...(input.address !== undefined
        ? { address: input.address ?? null }
        : {}),
      ...(input.notes !== undefined
        ? { notes: input.notes ?? null }
        : {}),
    },
  });

  return buildCustomerDetail(customer, businessId);
}

export async function archiveCustomer(
  businessId: string,
  customerId: string,
): Promise<CustomerDetail> {
  await assertCustomerInBusiness(businessId, customerId);

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: { isActive: false },
  });

  return buildCustomerDetail(customer, businessId);
}

export async function restoreCustomer(
  businessId: string,
  customerId: string,
): Promise<CustomerDetail> {
  await assertCustomerInBusiness(businessId, customerId);

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: { isActive: true },
  });

  return buildCustomerDetail(customer, businessId);
}

export async function getCustomerHistory(
  businessId: string,
  customerId: string,
): Promise<CustomerHistoryResponse> {
  await assertCustomerInBusiness(businessId, customerId);

  const [sales, debts, payments] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.customerDebt.findMany({
      where: { businessId, customerId },
      include: {
        sale: {
          select: {
            receiptNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.debtPayment.findMany({
      where: { businessId, customerId },
      include: {
        debt: {
          include: {
            sale: {
              select: {
                receiptNumber: true,
              },
            },
          },
        },
        recordedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    sales: sales.map((sale) => ({
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      totalAmount: formatMoney(sale.totalAmount),
      amountPaid: formatMoney(sale.amountPaid),
      outstandingAmount: formatMoney(sale.outstandingAmount),
      paymentStatus: sale.paymentStatus,
      createdAt: sale.createdAt.toISOString(),
    })),

    debts: debts.map((debt) => ({
      id: debt.id,
      saleId: debt.saleId,
      receiptNumber: debt.sale.receiptNumber,
      originalAmount: formatMoney(debt.originalAmount),
      amountPaid: formatMoney(debt.amountPaid),
      outstandingAmount: formatMoney(debt.outstandingAmount),
      status: debt.status,
      createdAt: debt.createdAt.toISOString(),
    })),

    payments: payments.map((payment) => ({
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
      receiptNumber: payment.debt.sale.receiptNumber,
    })),
  };
}