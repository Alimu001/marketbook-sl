import { apiRequest } from "./client";
import { businessScopedPath } from "./businesses";
import type {
  DashboardSummary,
  ExpensesReportResponse,
  InventoryReportResponse,
  PayablesReportResponse,
  PurchasesReportResponse,
  ReceivablesReportResponse,
  SalesReportResponse,
  TopProductsReportResponse,
} from "@/reports/types";
import type { ReportPeriodRange } from "@/reports/period";

function reportsPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/reports${suffix}`;
}

function buildRangeQuery(range: ReportPeriodRange, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    ...extra,
  });
  return `?${params.toString()}`;
}

export function getDashboardSummary(
  accessToken: string,
  businessId: string,
  range: ReportPeriodRange,
): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>(
    `${reportsPath(businessId, "/dashboard")}${buildRangeQuery(range)}`,
    { method: "GET", accessToken },
  );
}

export function getSalesReport(
  accessToken: string,
  businessId: string,
  range: ReportPeriodRange,
  params: Record<string, string> = {},
): Promise<SalesReportResponse> {
  return apiRequest<SalesReportResponse>(
    `${reportsPath(businessId, "/sales")}${buildRangeQuery(range, params)}`,
    { method: "GET", accessToken },
  );
}

export function getTopProductsReport(
  accessToken: string,
  businessId: string,
  range: ReportPeriodRange,
  sortBy: "quantity" | "revenue" | "grossProfit" = "revenue",
): Promise<TopProductsReportResponse> {
  return apiRequest<TopProductsReportResponse>(
    `${reportsPath(businessId, "/products")}${buildRangeQuery(range, {
      sortBy,
      limit: "10",
    })}`,
    { method: "GET", accessToken },
  );
}

export function getPurchasesReport(
  accessToken: string,
  businessId: string,
  range: ReportPeriodRange,
): Promise<PurchasesReportResponse> {
  return apiRequest<PurchasesReportResponse>(
    `${reportsPath(businessId, "/purchases")}${buildRangeQuery(range)}`,
    { method: "GET", accessToken },
  );
}

export function getExpensesReport(
  accessToken: string,
  businessId: string,
  range: ReportPeriodRange,
): Promise<ExpensesReportResponse> {
  return apiRequest<ExpensesReportResponse>(
    `${reportsPath(businessId, "/expenses")}${buildRangeQuery(range)}`,
    { method: "GET", accessToken },
  );
}

export function getReceivablesReport(
  accessToken: string,
  businessId: string,
): Promise<ReceivablesReportResponse> {
  return apiRequest<ReceivablesReportResponse>(
    reportsPath(businessId, "/receivables"),
    { method: "GET", accessToken },
  );
}

export function getPayablesReport(
  accessToken: string,
  businessId: string,
): Promise<PayablesReportResponse> {
  return apiRequest<PayablesReportResponse>(
    reportsPath(businessId, "/payables"),
    { method: "GET", accessToken },
  );
}

export function getInventoryReport(
  accessToken: string,
  businessId: string,
): Promise<InventoryReportResponse> {
  return apiRequest<InventoryReportResponse>(
    reportsPath(businessId, "/inventory"),
    { method: "GET", accessToken },
  );
}
