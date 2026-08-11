import type {
  DailyActivityReport,
  DashboardSummary,
  ExpensesReportResponse,
  InventoryReportResponse,
  PayablesReportResponse,
  PurchasesReportResponse,
  ReceivablesReportResponse,
  SalesReportResponse,
  TopProductsReportResponse,
} from "@marketbook/shared/types";
import type {
  DailyReportQuery,
  DashboardReportQuery,
  ExpensesReportQuery,
  PurchasesReportQuery,
  ReportExportQuery,
  SalesReportQuery,
  TopProductsReportQuery,
} from "@marketbook/shared/validation";
import { Prisma } from "../../../generated/prisma/client.js";
import { isLowStock } from "../../lib/quantity.js";
import {
  formatReportDateOutput,
  reportDateRangeToDateTimeBounds,
  reportDateRangeToExpenseDateBounds,
} from "../../lib/reportDate.js";
import { formatMoney, subtractMoney, sumMoney } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import {
  buildCsv,
  calculateAverage,
  calculatePercentage,
  decimalFromUnknown,
  formatMoneyFromUnknown,
} from "./reportFormatters.js";

const COMPLETED_SALE = { status: "COMPLETED" as const };
const COMPLETED_PURCHASE = { status: "COMPLETED" as const };

function buildPeriod(from: string, to: string) {
  return { from, to };
}

async function aggregateSalesRevenue(
  businessId: string,
  bounds: { from: Date; to: Date },
  extraWhere: Prisma.SaleWhereInput = {},
): Promise<{ revenue: Prisma.Decimal; count: number; paid: Prisma.Decimal; outstanding: Prisma.Decimal }> {
  const where: Prisma.SaleWhereInput = {
    businessId,
    ...COMPLETED_SALE,
    createdAt: { gte: bounds.from, lte: bounds.to },
    ...extraWhere,
  };

  const aggregate = await prisma.sale.aggregate({
    where,
    _sum: {
      totalAmount: true,
      refundedAmount: true,
      amountPaid: true,
      outstandingAmount: true,
    },
    _count: true,
  });

  const grossRevenue = aggregate._sum.totalAmount ?? new Prisma.Decimal(0);
  const refunded = aggregate._sum.refundedAmount ?? new Prisma.Decimal(0);

  return {
    revenue: grossRevenue.sub(refunded),
    count: aggregate._count,
    paid: aggregate._sum.amountPaid ?? new Prisma.Decimal(0),
    outstanding: aggregate._sum.outstandingAmount ?? new Prisma.Decimal(0),
  };
}

async function aggregateCostOfGoodsSold(
  businessId: string,
  bounds: { from: Date; to: Date },
  extraSaleWhere: Prisma.SaleWhereInput = {},
): Promise<Prisma.Decimal> {
  const rows = await prisma.$queryRaw<Array<{ cogs: unknown; refund_cogs: unknown }>>`
    SELECT
      COALESCE(SUM(si.quantity * si."costPriceSnapshot"), 0) AS cogs,
      COALESCE((
        SELECT SUM(sri.quantity * sri."costPriceSnapshot")
        FROM "SaleRefundItem" sri
        INNER JOIN "SaleRefund" sr ON sr.id = sri."refundId"
        INNER JOIN "Sale" s2 ON s2.id = sr."saleId"
        WHERE s2."businessId" = ${businessId}::uuid
          AND s2.status = 'COMPLETED'
          AND s2."createdAt" >= ${bounds.from}
          AND s2."createdAt" <= ${bounds.to}
      ), 0) AS refund_cogs
    FROM "SaleItem" si
    INNER JOIN "Sale" s ON s.id = si."saleId"
    WHERE s."businessId" = ${businessId}::uuid
      AND s.status = 'COMPLETED'
      AND s."createdAt" >= ${bounds.from}
      AND s."createdAt" <= ${bounds.to}
      ${
        extraSaleWhere.paymentMethod
          ? Prisma.sql`AND s."paymentMethod" = ${extraSaleWhere.paymentMethod}::"PaymentMethod"`
          : Prisma.empty
      }
      ${
        extraSaleWhere.paymentStatus
          ? Prisma.sql`AND s."paymentStatus" = ${extraSaleWhere.paymentStatus}::"SalePaymentStatus"`
          : Prisma.empty
      }
      ${
        extraSaleWhere.customerId
          ? Prisma.sql`AND s."customerId" = ${extraSaleWhere.customerId}::uuid`
          : Prisma.empty
      }
  `;

  const cogs = decimalFromUnknown(rows[0]?.cogs);
  const refundCogs = decimalFromUnknown(rows[0]?.refund_cogs);

  return cogs.sub(refundCogs);
}

async function aggregateOperatingExpenses(
  businessId: string,
  bounds: { from: Date; to: Date },
  extraWhere: Prisma.ExpenseWhereInput = {},
): Promise<{ total: Prisma.Decimal; count: number }> {
  const where: Prisma.ExpenseWhereInput = {
    businessId,
    expenseDate: { gte: bounds.from, lte: bounds.to },
    ...extraWhere,
  };

  const aggregate = await prisma.expense.aggregate({
    where,
    _sum: { amount: true },
    _count: true,
  });

  return {
    total: aggregate._sum.amount ?? new Prisma.Decimal(0),
    count: aggregate._count,
  };
}

async function aggregatePurchaseSpend(
  businessId: string,
  bounds: { from: Date; to: Date },
  extraWhere: Prisma.PurchaseWhereInput = {},
): Promise<{
  spend: Prisma.Decimal;
  paid: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  count: number;
}> {
  const where: Prisma.PurchaseWhereInput = {
    businessId,
    ...COMPLETED_PURCHASE,
    createdAt: { gte: bounds.from, lte: bounds.to },
    ...extraWhere,
  };

  const aggregate = await prisma.purchase.aggregate({
    where,
    _sum: {
      totalAmount: true,
      amountPaid: true,
      outstandingAmount: true,
    },
    _count: true,
  });

  return {
    spend: aggregate._sum.totalAmount ?? new Prisma.Decimal(0),
    paid: aggregate._sum.amountPaid ?? new Prisma.Decimal(0),
    outstanding: aggregate._sum.outstandingAmount ?? new Prisma.Decimal(0),
    count: aggregate._count,
  };
}

async function getCurrentReceivables(businessId: string): Promise<Prisma.Decimal> {
  const aggregate = await prisma.customerDebt.aggregate({
    where: {
      businessId,
      status: { in: ["OPEN", "PARTIALLY_PAID"] },
    },
    _sum: { outstandingAmount: true },
  });

  return aggregate._sum.outstandingAmount ?? new Prisma.Decimal(0);
}

async function getCurrentPayables(businessId: string): Promise<Prisma.Decimal> {
  const aggregate = await prisma.supplierPayable.aggregate({
    where: {
      businessId,
      status: { in: ["OPEN", "PARTIALLY_PAID"] },
    },
    _sum: { outstandingAmount: true },
  });

  return aggregate._sum.outstandingAmount ?? new Prisma.Decimal(0);
}

async function getInventoryCounts(businessId: string) {
  const products = await prisma.product.findMany({
    where: { businessId },
    include: { inventoryBalance: true },
  });

  let lowStockCount = 0;
  let activeProducts = 0;

  for (const product of products) {
    if (product.isActive) {
      activeProducts += 1;
    }

    const balance = product.inventoryBalance;

    if (
      balance &&
      isLowStock(balance.quantity, balance.lowStockThreshold)
    ) {
      lowStockCount += 1;
    }
  }

  return { lowStockCount, activeProducts };
}

export async function getDashboardSummary(
  businessId: string,
  query: DashboardReportQuery,
): Promise<DashboardSummary> {
  const bounds = reportDateRangeToDateTimeBounds(query.from, query.to);
  const expenseBounds = reportDateRangeToExpenseDateBounds(query.from, query.to);

  const [sales, cogs, expenses, purchases, receivables, payables, inventory] =
    await Promise.all([
      aggregateSalesRevenue(businessId, bounds),
      aggregateCostOfGoodsSold(businessId, bounds),
      aggregateOperatingExpenses(businessId, expenseBounds),
      aggregatePurchaseSpend(businessId, bounds),
      getCurrentReceivables(businessId),
      getCurrentPayables(businessId),
      getInventoryCounts(businessId),
    ]);

  const grossProfit = subtractMoney(sales.revenue, cogs);
  const estimatedNetOperatingProfit = subtractMoney(
    grossProfit,
    expenses.total,
  );

  return {
    period: buildPeriod(query.from, query.to),
    salesRevenue: formatMoney(sales.revenue),
    costOfGoodsSold: formatMoney(cogs),
    grossProfit: formatMoney(grossProfit),
    operatingExpenses: formatMoney(expenses.total),
    estimatedNetOperatingProfit: formatMoney(estimatedNetOperatingProfit),
    purchaseSpend: formatMoney(purchases.spend),
    customerReceivables: formatMoney(receivables),
    supplierPayables: formatMoney(payables),
    salesCount: sales.count,
    purchaseCount: purchases.count,
    expenseCount: expenses.count,
    lowStockCount: inventory.lowStockCount,
    activeProducts: inventory.activeProducts,
  };
}

export async function getSalesReport(
  businessId: string,
  query: SalesReportQuery,
): Promise<SalesReportResponse> {
  const bounds = reportDateRangeToDateTimeBounds(query.from, query.to);
  const saleWhere: Prisma.SaleWhereInput = {
    businessId,
    ...COMPLETED_SALE,
    createdAt: { gte: bounds.from, lte: bounds.to },
    ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
  };

  const [salesAgg, cogs, byMethodRows, byStatusRows, byDayRows, total, sales] =
    await Promise.all([
      aggregateSalesRevenue(businessId, bounds, saleWhere),
      aggregateCostOfGoodsSold(businessId, bounds, saleWhere),
      prisma.sale.groupBy({
        by: ["paymentMethod"],
        where: saleWhere,
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.sale.groupBy({
        by: ["paymentStatus"],
        where: saleWhere,
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.$queryRaw<
        Array<{
          day: string;
          revenue: unknown;
          sale_count: bigint;
          cogs: unknown;
        }>
      >`
        SELECT
          to_char(s."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
          COALESCE(SUM(s."totalAmount"), 0) AS revenue,
          COUNT(*)::bigint AS sale_count,
          COALESCE(SUM(si.quantity * si."costPriceSnapshot"), 0) AS cogs
        FROM "Sale" s
        LEFT JOIN "SaleItem" si ON si."saleId" = s.id
        WHERE s."businessId" = ${businessId}::uuid
          AND s.status = 'COMPLETED'
          AND s."createdAt" >= ${bounds.from}
          AND s."createdAt" <= ${bounds.to}
          ${
            query.paymentMethod
              ? Prisma.sql`AND s."paymentMethod" = ${query.paymentMethod}::"PaymentMethod"`
              : Prisma.empty
          }
          ${
            query.paymentStatus
              ? Prisma.sql`AND s."paymentStatus" = ${query.paymentStatus}::"SalePaymentStatus"`
              : Prisma.empty
          }
          ${
            query.customerId
              ? Prisma.sql`AND s."customerId" = ${query.customerId}::uuid`
              : Prisma.empty
          }
        GROUP BY day
        ORDER BY day ASC
      `,
      prisma.sale.count({ where: saleWhere }),
      prisma.sale.findMany({
        where: saleWhere,
        orderBy: [{ createdAt: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          receiptNumber: true,
          totalAmount: true,
          amountPaid: true,
          outstandingAmount: true,
          paymentMethod: true,
          paymentStatus: true,
          customerNameSnapshot: true,
          createdAt: true,
        },
      }),
    ]);

  const grossProfit = subtractMoney(salesAgg.revenue, cogs);

  return {
    period: buildPeriod(query.from, query.to),
    summary: {
      totalRevenue: formatMoney(salesAgg.revenue),
      totalCostOfGoodsSold: formatMoney(cogs),
      grossProfit: formatMoney(grossProfit),
      saleCount: salesAgg.count,
      averageSaleValue: calculateAverage(salesAgg.revenue, salesAgg.count),
      totalPaidAtSale: formatMoney(salesAgg.paid),
      totalOutstandingFromSales: formatMoney(salesAgg.outstanding),
    },
    byPaymentMethod: byMethodRows.map((row) => ({
      paymentMethod: row.paymentMethod,
      revenue: formatMoneyFromUnknown(row._sum.totalAmount),
      saleCount: row._count,
    })),
    byPaymentStatus: byStatusRows.map((row) => ({
      paymentStatus: row.paymentStatus,
      revenue: formatMoneyFromUnknown(row._sum.totalAmount),
      saleCount: row._count,
    })),
    byDay: byDayRows.map((row) => {
      const revenue = decimalFromUnknown(row.revenue);
      const dayCogs = decimalFromUnknown(row.cogs);
      return {
        date: row.day,
        revenue: formatMoney(revenue),
        saleCount: Number(row.sale_count),
        costOfGoodsSold: formatMoney(dayCogs),
        grossProfit: formatMoney(subtractMoney(revenue, dayCogs)),
      };
    }),
    items: sales.map((sale) => ({
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      totalAmount: formatMoney(sale.totalAmount),
      amountPaid: formatMoney(sale.amountPaid),
      outstandingAmount: formatMoney(sale.outstandingAmount),
      paymentMethod: sale.paymentMethod,
      paymentStatus: sale.paymentStatus,
      customerName: sale.customerNameSnapshot,
      createdAt: sale.createdAt.toISOString(),
    })),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getTopProductsReport(
  businessId: string,
  query: TopProductsReportQuery,
): Promise<TopProductsReportResponse> {
  const bounds = reportDateRangeToDateTimeBounds(query.from, query.to);

  const rows = await prisma.$queryRaw<
    Array<{
      product_id: string;
      name: string;
      quantity_sold: unknown;
      revenue: unknown;
      cogs: unknown;
    }>
  >`
    SELECT
      si."productId" AS product_id,
      MAX(si."productNameSnapshot") AS name,
      COALESCE(SUM(si.quantity), 0) AS quantity_sold,
      COALESCE(SUM(si."lineSubtotal"), 0) AS revenue,
      COALESCE(SUM(si.quantity * si."costPriceSnapshot"), 0) AS cogs
    FROM "SaleItem" si
    INNER JOIN "Sale" s ON s.id = si."saleId"
    WHERE s."businessId" = ${businessId}::uuid
      AND s.status = 'COMPLETED'
      AND s."createdAt" >= ${bounds.from}
      AND s."createdAt" <= ${bounds.to}
    GROUP BY si."productId"
  `;

  const mapped = rows.map((row) => {
    const revenue = decimalFromUnknown(row.revenue);
    const cogs = decimalFromUnknown(row.cogs);
    const quantitySold = decimalFromUnknown(row.quantity_sold);
    const grossProfit = subtractMoney(revenue, cogs);
    return {
      productId: row.product_id,
      name: row.name,
      quantitySold,
      revenue,
      cogs,
      grossProfit,
    };
  });

  mapped.sort((left, right) => {
    if (query.sortBy === "quantity") {
      return right.quantitySold.comparedTo(left.quantitySold);
    }

    if (query.sortBy === "grossProfit") {
      return right.grossProfit.comparedTo(left.grossProfit);
    }

    return right.revenue.comparedTo(left.revenue);
  });

  const pageItems = mapped.slice(0, query.limit);

  return {
    period: buildPeriod(query.from, query.to),
    items: pageItems.map((row) => ({
      productId: row.productId,
      name: row.name,
      quantitySold: row.quantitySold.toFixed(4).replace(/\.?0+$/, ""),
      revenue: formatMoney(row.revenue),
      costOfGoodsSold: formatMoney(row.cogs),
      grossProfit: formatMoney(row.grossProfit),
    })),
  };
}

export async function getPurchasesReport(
  businessId: string,
  query: PurchasesReportQuery,
): Promise<PurchasesReportResponse> {
  const bounds = reportDateRangeToDateTimeBounds(query.from, query.to);
  const purchaseWhere: Prisma.PurchaseWhereInput = {
    businessId,
    createdAt: { gte: bounds.from, lte: bounds.to },
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
  };

  const [summary, bySupplierRows, byDayRows] = await Promise.all([
    aggregatePurchaseSpend(businessId, bounds, purchaseWhere),
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where: purchaseWhere,
      _sum: {
        totalAmount: true,
        amountPaid: true,
        outstandingAmount: true,
      },
      _count: true,
    }),
    prisma.$queryRaw<
      Array<{
        day: string;
        purchase_spend: unknown;
        amount_paid: unknown;
        outstanding_generated: unknown;
        purchase_count: bigint;
      }>
    >`
      SELECT
        to_char(p."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        COALESCE(SUM(p."totalAmount"), 0) AS purchase_spend,
        COALESCE(SUM(p."amountPaid"), 0) AS amount_paid,
        COALESCE(SUM(p."outstandingAmount"), 0) AS outstanding_generated,
        COUNT(*)::bigint AS purchase_count
      FROM "Purchase" p
      WHERE p."businessId" = ${businessId}::uuid
        AND p."createdAt" >= ${bounds.from}
        AND p."createdAt" <= ${bounds.to}
        ${
          query.supplierId
            ? Prisma.sql`AND p."supplierId" = ${query.supplierId}::uuid`
            : Prisma.empty
        }
        ${
          query.paymentStatus
            ? Prisma.sql`AND p."paymentStatus" = ${query.paymentStatus}::"SalePaymentStatus"`
            : Prisma.empty
        }
      GROUP BY day
      ORDER BY day ASC
    `,
  ]);

  const supplierIds = bySupplierRows.map((row) => row.supplierId);
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: supplierIds } },
    select: { id: true, name: true },
  });
  const supplierNameMap = new Map(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  );

  return {
    period: buildPeriod(query.from, query.to),
    summary: {
      purchaseSpend: formatMoney(summary.spend),
      amountPaid: formatMoney(summary.paid),
      outstandingGenerated: formatMoney(summary.outstanding),
      purchaseCount: summary.count,
      averagePurchaseValue: calculateAverage(summary.spend, summary.count),
    },
    bySupplier: bySupplierRows.map((row) => ({
      supplierId: row.supplierId,
      supplierName: supplierNameMap.get(row.supplierId) ?? "Unknown",
      purchaseSpend: formatMoneyFromUnknown(row._sum.totalAmount),
      amountPaid: formatMoneyFromUnknown(row._sum.amountPaid),
      outstandingGenerated: formatMoneyFromUnknown(row._sum.outstandingAmount),
      purchaseCount: row._count,
    })),
    byDay: byDayRows.map((row) => ({
      date: row.day,
      purchaseSpend: formatMoneyFromUnknown(row.purchase_spend),
      amountPaid: formatMoneyFromUnknown(row.amount_paid),
      outstandingGenerated: formatMoneyFromUnknown(row.outstanding_generated),
      purchaseCount: Number(row.purchase_count),
    })),
  };
}

export async function getExpensesReport(
  businessId: string,
  query: ExpensesReportQuery,
): Promise<ExpensesReportResponse> {
  const bounds = reportDateRangeToExpenseDateBounds(query.from, query.to);
  const expenseWhere: Prisma.ExpenseWhereInput = {
    businessId,
    expenseDate: { gte: bounds.from, lte: bounds.to },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
  };

  const [summary, byCategoryRows, byPaymentRows, byDayRows] = await Promise.all([
    aggregateOperatingExpenses(businessId, bounds, expenseWhere),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where: expenseWhere,
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expense.groupBy({
      by: ["paymentMethod"],
      where: expenseWhere,
      _sum: { amount: true },
      _count: true,
    }),
    prisma.$queryRaw<
      Array<{ day: string; total_amount: unknown; expense_count: bigint }>
    >`
      SELECT
        to_char(e."expenseDate", 'YYYY-MM-DD') AS day,
        COALESCE(SUM(e.amount), 0) AS total_amount,
        COUNT(*)::bigint AS expense_count
      FROM "Expense" e
      WHERE e."businessId" = ${businessId}::uuid
        AND e."expenseDate" >= ${bounds.from}
        AND e."expenseDate" <= ${bounds.to}
        ${
          query.categoryId
            ? Prisma.sql`AND e."categoryId" = ${query.categoryId}::uuid`
            : Prisma.empty
        }
        ${
          query.paymentMethod
            ? Prisma.sql`AND e."paymentMethod" = ${query.paymentMethod}::"PaymentMethod"`
            : Prisma.empty
        }
      GROUP BY day
      ORDER BY day ASC
    `,
  ]);

  const categories = await prisma.expenseCategory.findMany({
    where: {
      id: { in: byCategoryRows.map((row) => row.categoryId) },
    },
    select: { id: true, name: true },
  });
  const categoryNameMap = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  return {
    period: buildPeriod(query.from, query.to),
    summary: {
      totalOperatingExpenses: formatMoney(summary.total),
      expenseCount: summary.count,
      averageExpense: calculateAverage(summary.total, summary.count),
    },
    byCategory: byCategoryRows.map((row) => {
      const total = decimalFromUnknown(row._sum.amount);
      return {
        categoryId: row.categoryId,
        categoryName: categoryNameMap.get(row.categoryId) ?? "Unknown",
        totalAmount: formatMoney(total),
        expenseCount: row._count,
        percentage: calculatePercentage(total, summary.total),
      };
    }),
    byPaymentMethod: byPaymentRows.map((row) => {
      const total = decimalFromUnknown(row._sum.amount);
      return {
        paymentMethod: row.paymentMethod,
        totalAmount: formatMoney(total),
        expenseCount: row._count,
        percentage: calculatePercentage(total, summary.total),
      };
    }),
    byDay: byDayRows.map((row) => ({
      date: row.day,
      totalAmount: formatMoneyFromUnknown(row.total_amount),
      expenseCount: Number(row.expense_count),
    })),
  };
}

export async function getReceivablesReport(
  businessId: string,
): Promise<ReceivablesReportResponse> {
  const debts = await prisma.customerDebt.findMany({
    where: { businessId },
    include: { customer: { select: { id: true, name: true } } },
  });

  const openDebts = debts.filter((debt) => debt.status !== "PAID");
  const totalOutstanding = sumMoney(
    openDebts.map((debt) => debt.outstandingAmount),
  );
  const totalOriginal = sumMoney(debts.map((debt) => debt.originalAmount));
  const totalCollected = sumMoney(debts.map((debt) => debt.amountPaid));

  const customerMap = new Map<
    string,
    { customerId: string; customerName: string; outstanding: Prisma.Decimal; count: number }
  >();

  for (const debt of openDebts) {
    const existing = customerMap.get(debt.customerId);
    if (existing) {
      existing.outstanding = existing.outstanding.add(debt.outstandingAmount);
      existing.count += 1;
    } else {
      customerMap.set(debt.customerId, {
        customerId: debt.customerId,
        customerName: debt.customer.name,
        outstanding: debt.outstandingAmount,
        count: 1,
      });
    }
  }

  const topCustomers = [...customerMap.values()]
    .sort((a, b) => b.outstanding.comparedTo(a.outstanding))
    .slice(0, 10)
    .map((entry) => ({
      customerId: entry.customerId,
      customerName: entry.customerName,
      outstandingAmount: formatMoney(entry.outstanding),
      openDebtCount: entry.count,
    }));

  return {
    totalOutstanding: formatMoney(totalOutstanding),
    openDebtCount: openDebts.filter((debt) => debt.status === "OPEN").length,
    partiallyPaidCount: openDebts.filter(
      (debt) => debt.status === "PARTIALLY_PAID",
    ).length,
    unpaidCount: openDebts.length,
    totalOriginalReceivables: formatMoney(totalOriginal),
    totalCollected: formatMoney(totalCollected),
    topCustomers,
  };
}

export async function getPayablesReport(
  businessId: string,
): Promise<PayablesReportResponse> {
  const payables = await prisma.supplierPayable.findMany({
    where: { businessId },
    include: { supplier: { select: { id: true, name: true } } },
  });

  const openPayables = payables.filter((payable) => payable.status !== "PAID");
  const totalOutstanding = sumMoney(
    openPayables.map((payable) => payable.outstandingAmount),
  );
  const totalOriginal = sumMoney(
    payables.map((payable) => payable.originalAmount),
  );
  const totalPaid = sumMoney(payables.map((payable) => payable.amountPaid));

  const supplierMap = new Map<
    string,
    { supplierId: string; supplierName: string; outstanding: Prisma.Decimal; count: number }
  >();

  for (const payable of openPayables) {
    const existing = supplierMap.get(payable.supplierId);
    if (existing) {
      existing.outstanding = existing.outstanding.add(payable.outstandingAmount);
      existing.count += 1;
    } else {
      supplierMap.set(payable.supplierId, {
        supplierId: payable.supplierId,
        supplierName: payable.supplier.name,
        outstanding: payable.outstandingAmount,
        count: 1,
      });
    }
  }

  const topSuppliers = [...supplierMap.values()]
    .sort((a, b) => b.outstanding.comparedTo(a.outstanding))
    .slice(0, 10)
    .map((entry) => ({
      supplierId: entry.supplierId,
      supplierName: entry.supplierName,
      outstandingAmount: formatMoney(entry.outstanding),
      openPayableCount: entry.count,
    }));

  return {
    totalOutstanding: formatMoney(totalOutstanding),
    openPayableCount: openPayables.filter(
      (payable) => payable.status === "OPEN",
    ).length,
    partiallyPaidCount: openPayables.filter(
      (payable) => payable.status === "PARTIALLY_PAID",
    ).length,
    totalOriginalPayables: formatMoney(totalOriginal),
    totalPaid: formatMoney(totalPaid),
    topSuppliers,
  };
}

export async function getInventoryReport(
  businessId: string,
): Promise<InventoryReportResponse> {
  const products = await prisma.product.findMany({
    where: { businessId },
    include: { inventoryBalance: true },
    orderBy: [{ name: "asc" }],
  });

  let activeProducts = 0;
  let archivedProducts = 0;
  let lowStockProducts = 0;
  let zeroStockProducts = 0;

  const items = products.map((product) => {
    const quantity = product.inventoryBalance?.quantity ?? new Prisma.Decimal(0);
    const threshold =
      product.inventoryBalance?.lowStockThreshold ?? new Prisma.Decimal(0);
    const low = isLowStock(quantity, threshold);

    if (product.isActive) {
      activeProducts += 1;
    } else {
      archivedProducts += 1;
    }

    if (low) {
      lowStockProducts += 1;
    }

    if (quantity.lte(0)) {
      zeroStockProducts += 1;
    }

    return {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      quantity: quantity.toFixed(4).replace(/\.?0+$/, ""),
      lowStockThreshold: threshold.toFixed(4).replace(/\.?0+$/, ""),
      isLowStock: low,
      isActive: product.isActive,
    };
  });

  return {
    totalProducts: products.length,
    activeProducts,
    archivedProducts,
    lowStockProducts,
    zeroStockProducts,
    items,
  };
}

export async function getDailyActivityReport(
  businessId: string,
  query: DailyReportQuery,
): Promise<DailyActivityReport> {
  const bounds = reportDateRangeToDateTimeBounds(query.date, query.date);
  const expenseBounds = reportDateRangeToExpenseDateBounds(
    query.date,
    query.date,
  );

  const [sales, cogs, expenses, purchases, creditSales, debtPayments, supplierPayments] =
    await Promise.all([
      aggregateSalesRevenue(businessId, bounds),
      aggregateCostOfGoodsSold(businessId, bounds),
      aggregateOperatingExpenses(businessId, expenseBounds),
      aggregatePurchaseSpend(businessId, bounds),
      prisma.sale.aggregate({
        where: {
          businessId,
          ...COMPLETED_SALE,
          createdAt: { gte: bounds.from, lte: bounds.to },
          paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
        },
        _sum: { outstandingAmount: true },
      }),
      prisma.debtPayment.aggregate({
        where: {
          businessId,
          createdAt: { gte: bounds.from, lte: bounds.to },
        },
        _sum: { amount: true },
      }),
      prisma.supplierPayment.aggregate({
        where: {
          businessId,
          createdAt: { gte: bounds.from, lte: bounds.to },
        },
        _sum: { amount: true },
      }),
    ]);

  const grossProfit = subtractMoney(sales.revenue, cogs);

  return {
    date: query.date,
    salesRevenue: formatMoney(sales.revenue),
    saleCount: sales.count,
    costOfGoodsSold: formatMoney(cogs),
    grossProfit: formatMoney(grossProfit),
    operatingExpenses: formatMoney(expenses.total),
    estimatedNetOperatingProfit: formatMoney(
      subtractMoney(grossProfit, expenses.total),
    ),
    purchaseSpend: formatMoney(purchases.spend),
    creditSalesCreated: formatMoneyFromUnknown(
      creditSales._sum.outstandingAmount,
    ),
    debtPaymentsReceived: formatMoneyFromUnknown(debtPayments._sum.amount),
    supplierPaymentsMade: formatMoneyFromUnknown(supplierPayments._sum.amount),
  };
}

export async function exportSalesCsv(
  businessId: string,
  query: ReportExportQuery,
): Promise<string> {
  const report = await getSalesReport(businessId, {
    ...query,
    page: 1,
    limit: 10000,
  });

  return buildCsv(
    [
      "Receipt Number",
      "Date",
      "Customer",
      "Total Amount",
      "Amount Paid",
      "Outstanding",
      "Payment Method",
      "Payment Status",
    ],
    report.items.map((item) => [
      item.receiptNumber,
      item.createdAt,
      item.customerName ?? "",
      item.totalAmount,
      item.amountPaid,
      item.outstandingAmount,
      item.paymentMethod ?? "",
      item.paymentStatus,
    ]),
  );
}

export async function exportExpensesCsv(
  businessId: string,
  query: ReportExportQuery,
): Promise<string> {
  const bounds = reportDateRangeToExpenseDateBounds(query.from, query.to);
  const expenses = await prisma.expense.findMany({
    where: {
      businessId,
      expenseDate: { gte: bounds.from, lte: bounds.to },
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
    },
    include: { category: { select: { name: true } } },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
  });

  return buildCsv(
    [
      "Date",
      "Category",
      "Description",
      "Vendor/Payee",
      "Reference",
      "Amount",
      "Payment Method",
      "Archived",
    ],
    expenses.map((expense) => [
      formatReportDateOutput(expense.expenseDate),
      expense.category.name,
      expense.description,
      expense.vendorOrPayee ?? "",
      expense.referenceNumber ?? "",
      formatMoney(expense.amount),
      expense.paymentMethod,
      expense.isArchived ? "Yes" : "No",
    ]),
  );
}

export async function exportPurchasesCsv(
  businessId: string,
  query: ReportExportQuery,
): Promise<string> {
  const bounds = reportDateRangeToDateTimeBounds(query.from, query.to);
  const purchases = await prisma.purchase.findMany({
    where: {
      businessId,
      createdAt: { gte: bounds.from, lte: bounds.to },
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return buildCsv(
    [
      "Purchase Number",
      "Date",
      "Supplier",
      "Total Amount",
      "Amount Paid",
      "Outstanding",
      "Payment Status",
    ],
    purchases.map((purchase) => [
      purchase.purchaseNumber,
      purchase.createdAt.toISOString(),
      purchase.supplierNameSnapshot,
      formatMoney(purchase.totalAmount),
      formatMoney(purchase.amountPaid),
      formatMoney(purchase.outstandingAmount),
      purchase.paymentStatus,
    ]),
  );
}
