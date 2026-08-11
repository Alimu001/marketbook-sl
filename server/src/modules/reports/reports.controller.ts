import type { NextFunction, Request, Response } from "express";
import type {
  DailyReportQuery,
  DashboardReportQuery,
  ExpensesReportQuery,
  PurchasesReportQuery,
  ReportExportQuery,
  SalesReportQuery,
  TopProductsReportQuery,
} from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import * as reportsService from "./reports.service.js";

function getBusinessId(req: Request): string {
  const businessId = req.business?.id;

  if (!businessId) {
    throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
  }

  return businessId;
}

export async function getDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const summary = await reportsService.getDashboardSummary(
      getBusinessId(req),
      req.validatedQuery as DashboardReportQuery,
    );
    res.status(200).json({ data: summary });
  } catch (error) {
    next(error);
  }
}

export async function getSalesReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await reportsService.getSalesReport(
      getBusinessId(req),
      req.validatedQuery as SalesReportQuery,
    );
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
}

export async function getTopProductsReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await reportsService.getTopProductsReport(
      getBusinessId(req),
      req.validatedQuery as TopProductsReportQuery,
    );
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
}

export async function getPurchasesReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await reportsService.getPurchasesReport(
      getBusinessId(req),
      req.validatedQuery as PurchasesReportQuery,
    );
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
}

export async function getExpensesReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await reportsService.getExpensesReport(
      getBusinessId(req),
      req.validatedQuery as ExpensesReportQuery,
    );
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
}

export async function getReceivablesReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await reportsService.getReceivablesReport(getBusinessId(req));
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
}

export async function getPayablesReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await reportsService.getPayablesReport(getBusinessId(req));
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
}

export async function getInventoryReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await reportsService.getInventoryReport(getBusinessId(req));
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
}

export async function getDailyReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await reportsService.getDailyActivityReport(
      getBusinessId(req),
      req.validatedQuery as DailyReportQuery,
    );
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
}

export async function exportSalesReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const csv = await reportsService.exportSalesCsv(
      getBusinessId(req),
      req.validatedQuery as ReportExportQuery,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sales-report-${Date.now()}.csv"`,
    );
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}

export async function exportExpensesReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const csv = await reportsService.exportExpensesCsv(
      getBusinessId(req),
      req.validatedQuery as ReportExportQuery,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="expenses-report-${Date.now()}.csv"`,
    );
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}

export async function exportPurchasesReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const csv = await reportsService.exportPurchasesCsv(
      getBusinessId(req),
      req.validatedQuery as ReportExportQuery,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="purchases-report-${Date.now()}.csv"`,
    );
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}
