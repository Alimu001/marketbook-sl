import { z } from "zod";
import { paymentMethods } from "./sales.js";
import { salePaymentStatuses } from "./sales.js";

const reportDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((value) => {
    const parts = value.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Date is invalid");

const MAX_REPORT_RANGE_DAYS = 730;

function validateReportRange(from: string, to: string): boolean {
  const fromDate = reportDateSchema.safeParse(from);
  const toDate = reportDateSchema.safeParse(to);

  if (!fromDate.success || !toDate.success) {
    return true;
  }

  if (from > to) {
    return false;
  }

  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const diffDays =
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  return diffDays <= MAX_REPORT_RANGE_DAYS;
}

export const reportDateRangeSchema = z
  .object({
    from: reportDateSchema,
    to: reportDateSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: "from date must be on or before to date",
    path: ["from"],
  })
  .refine((value) => validateReportRange(value.from, value.to), {
    message: "Report date range cannot exceed 2 years",
    path: ["to"],
  });

export const dashboardReportQuerySchema = reportDateRangeSchema;

export const salesReportQuerySchema = reportDateRangeSchema
  .extend({
    paymentMethod: z.enum(paymentMethods).optional(),
    paymentStatus: z.enum(salePaymentStatuses).optional(),
    customerId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const topProductsReportQuerySchema = reportDateRangeSchema
  .extend({
    limit: z.coerce.number().int().min(1).max(50).default(10),
    sortBy: z
      .enum(["quantity", "revenue", "grossProfit"])
      .default("revenue"),
  })
  .strict();

export const purchasesReportQuerySchema = reportDateRangeSchema
  .extend({
    supplierId: z.string().uuid().optional(),
    paymentStatus: z.enum(salePaymentStatuses).optional(),
  })
  .strict();

export const expensesReportQuerySchema = reportDateRangeSchema
  .extend({
    categoryId: z.string().uuid().optional(),
    paymentMethod: z.enum(paymentMethods).optional(),
  })
  .strict();

export const dailyReportQuerySchema = z
  .object({
    date: reportDateSchema,
  })
  .strict();

export const reportExportQuerySchema = reportDateRangeSchema
  .extend({
    paymentMethod: z.enum(paymentMethods).optional(),
    paymentStatus: z.enum(salePaymentStatuses).optional(),
    customerId: z.string().uuid().optional(),
    supplierId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
  })
  .strict();

export type DashboardReportQuery = z.infer<typeof dashboardReportQuerySchema>;
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;
export type TopProductsReportQuery = z.infer<
  typeof topProductsReportQuerySchema
>;
export type PurchasesReportQuery = z.infer<typeof purchasesReportQuerySchema>;
export type ExpensesReportQuery = z.infer<typeof expensesReportQuerySchema>;
export type DailyReportQuery = z.infer<typeof dailyReportQuerySchema>;
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
