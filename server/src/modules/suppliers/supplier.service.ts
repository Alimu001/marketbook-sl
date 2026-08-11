import type {
  SupplierDetail,
  SupplierHistoryResponse,
  SupplierSummary,
} from "@marketbook/shared/types";
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
} from "@marketbook/shared/validation";
import type { Prisma, Supplier } from "../../../generated/prisma/client.js";
import { Prisma as PrismaNamespace } from "../../../generated/prisma/client.js";
import { formatMoney } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

async function getOutstandingBalanceMap(
  businessId: string,
  supplierIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  if (supplierIds.length === 0) {
    return new Map();
  }

  const aggregates = await prisma.supplierPayable.groupBy({
    by: ["supplierId"],
    where: {
      businessId,
      supplierId: { in: supplierIds },
      status: { in: ["OPEN", "PARTIALLY_PAID"] },
    },
    _sum: {
      outstandingAmount: true,
    },
  });

  return new Map(
    aggregates.map((entry) => [
      entry.supplierId,
      entry._sum.outstandingAmount ?? new PrismaNamespace.Decimal(0),
    ]),
  );
}

async function getOutstandingBalance(
  businessId: string,
  supplierId: string,
): Promise<Prisma.Decimal> {
  const map = await getOutstandingBalanceMap(businessId, [supplierId]);
  return map.get(supplierId) ?? new PrismaNamespace.Decimal(0);
}

async function getOpenPayableCount(
  businessId: string,
  supplierId: string,
): Promise<number> {
  return prisma.supplierPayable.count({
    where: {
      businessId,
      supplierId,
      status: { in: ["OPEN", "PARTIALLY_PAID"] },
    },
  });
}

function toSupplierSummary(
  supplier: Supplier,
  outstandingBalance: Prisma.Decimal,
): SupplierSummary {
  return {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    isActive: supplier.isActive,
    outstandingBalance: formatMoney(outstandingBalance),
    createdAt: supplier.createdAt.toISOString(),
  };
}

function toSupplierDetail(
  supplier: Supplier,
  outstandingBalance: Prisma.Decimal,
  openPayableCount: number,
): SupplierDetail {
  return {
    id: supplier.id,
    businessId: supplier.businessId,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
    isActive: supplier.isActive,
    outstandingBalance: formatMoney(outstandingBalance),
    openPayableCount,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

export async function assertSupplierInBusiness(
  businessId: string,
  supplierId: string,
  options: { requireActive?: boolean } = {},
): Promise<Supplier> {
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      businessId,
    },
  });

  if (!supplier) {
    throw new AppError(404, "Supplier not found", "SUPPLIER_NOT_FOUND");
  }

  if (options.requireActive && !supplier.isActive) {
    throw new AppError(
      409,
      "Supplier is archived and cannot be used",
      "SUPPLIER_INACTIVE",
    );
  }

  return supplier;
}

export async function createSupplier(
  businessId: string,
  input: CreateSupplierInput,
): Promise<SupplierDetail> {
  const supplier = await prisma.supplier.create({
    data: {
      businessId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
    },
  });

  return toSupplierDetail(supplier, new PrismaNamespace.Decimal(0), 0);
}

export async function listSuppliers(
  businessId: string,
  query: ListSuppliersQuery,
) {
  const where = {
    businessId,
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { phone: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  if (query.hasPayable !== undefined) {
    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: [{ name: "asc" }],
    });

    const balanceMap = await getOutstandingBalanceMap(
      businessId,
      suppliers.map((supplier) => supplier.id),
    );

    const filtered = suppliers.filter((supplier) => {
      const balance =
        balanceMap.get(supplier.id) ?? new PrismaNamespace.Decimal(0);
      return query.hasPayable ? balance.gt(0) : balance.lte(0);
    });

    const pageItems = filtered.slice(skip, skip + query.limit);

    return {
      items: pageItems.map((supplier) =>
        toSupplierSummary(
          supplier,
          balanceMap.get(supplier.id) ?? new PrismaNamespace.Decimal(0),
        ),
      ),
      page: query.page,
      limit: query.limit,
      total: filtered.length,
    };
  }

  const [total, suppliers] = await prisma.$transaction([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip,
      take: query.limit,
    }),
  ]);

  const balanceMap = await getOutstandingBalanceMap(
    businessId,
    suppliers.map((supplier) => supplier.id),
  );

  return {
    items: suppliers.map((supplier) =>
      toSupplierSummary(
        supplier,
        balanceMap.get(supplier.id) ?? new PrismaNamespace.Decimal(0),
      ),
    ),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getSupplierDetail(
  businessId: string,
  supplierId: string,
): Promise<SupplierDetail> {
  const supplier = await assertSupplierInBusiness(businessId, supplierId);
  const outstandingBalance = await getOutstandingBalance(businessId, supplierId);
  const openPayableCount = await getOpenPayableCount(businessId, supplierId);

  return toSupplierDetail(supplier, outstandingBalance, openPayableCount);
}

export async function updateSupplier(
  businessId: string,
  supplierId: string,
  input: UpdateSupplierInput,
): Promise<SupplierDetail> {
  await assertSupplierInBusiness(businessId, supplierId);

  const supplier = await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      ...(input.email !== undefined ? { email: input.email ?? null } : {}),
      ...(input.address !== undefined ? { address: input.address ?? null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    },
  });

  const outstandingBalance = await getOutstandingBalance(businessId, supplierId);
  const openPayableCount = await getOpenPayableCount(businessId, supplierId);

  return toSupplierDetail(supplier, outstandingBalance, openPayableCount);
}

export async function archiveSupplier(
  businessId: string,
  supplierId: string,
): Promise<SupplierDetail> {
  await assertSupplierInBusiness(businessId, supplierId);

  const supplier = await prisma.supplier.update({
    where: { id: supplierId },
    data: { isActive: false },
  });

  const outstandingBalance = await getOutstandingBalance(businessId, supplierId);
  const openPayableCount = await getOpenPayableCount(businessId, supplierId);

  return toSupplierDetail(supplier, outstandingBalance, openPayableCount);
}

export async function restoreSupplier(
  businessId: string,
  supplierId: string,
): Promise<SupplierDetail> {
  await assertSupplierInBusiness(businessId, supplierId);

  const supplier = await prisma.supplier.update({
    where: { id: supplierId },
    data: { isActive: true },
  });

  const outstandingBalance = await getOutstandingBalance(businessId, supplierId);
  const openPayableCount = await getOpenPayableCount(businessId, supplierId);

  return toSupplierDetail(supplier, outstandingBalance, openPayableCount);
}

export async function getSupplierHistory(
  businessId: string,
  supplierId: string,
): Promise<SupplierHistoryResponse> {
  await assertSupplierInBusiness(businessId, supplierId);

  const [purchases, payables, payments] = await Promise.all([
    prisma.purchase.findMany({
      where: { businessId, supplierId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.supplierPayable.findMany({
      where: { businessId, supplierId },
      include: { purchase: { select: { purchaseNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.supplierPayment.findMany({
      where: { businessId, supplierId },
      include: {
        payable: {
          include: { purchase: { select: { purchaseNumber: true } } },
        },
        recordedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    purchases: purchases.map((purchase) => ({
      id: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      totalAmount: formatMoney(purchase.totalAmount),
      amountPaid: formatMoney(purchase.amountPaid),
      outstandingAmount: formatMoney(purchase.outstandingAmount),
      paymentStatus: purchase.paymentStatus,
      createdAt: purchase.createdAt.toISOString(),
    })),
    payables: payables.map((payable) => ({
      id: payable.id,
      purchaseId: payable.purchaseId,
      purchaseNumber: payable.purchase.purchaseNumber,
      originalAmount: formatMoney(payable.originalAmount),
      amountPaid: formatMoney(payable.amountPaid),
      outstandingAmount: formatMoney(payable.outstandingAmount),
      status: payable.status,
      createdAt: payable.createdAt.toISOString(),
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
      purchaseNumber: payment.payable.purchase.purchaseNumber,
    })),
  };
}
