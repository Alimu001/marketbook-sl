import { Router } from "express";
import {
  dailyReportQuerySchema,
  dashboardReportQuerySchema,
  expensesReportQuerySchema,
  purchasesReportQuerySchema,
  reportExportQuerySchema,
  salesReportQuerySchema,
  topProductsReportQuerySchema,
} from "@marketbook/shared/validation";
import { validateQuery } from "../../middleware/validate.js";
import { requireBusinessRole } from "../../middleware/businessAuth.js";
import * as reportsController from "./reports.controller.js";

export const reportsRouter = Router({ mergeParams: true });

const requireFinancialReporting = requireBusinessRole("owner", "admin");

reportsRouter.get(
  "/dashboard",
  validateQuery(dashboardReportQuerySchema),
  reportsController.getDashboard,
);

reportsRouter.get(
  "/sales",
  requireFinancialReporting,
  validateQuery(salesReportQuerySchema),
  reportsController.getSalesReport,
);

reportsRouter.get(
  "/sales/export",
  requireFinancialReporting,
  validateQuery(reportExportQuerySchema),
  reportsController.exportSalesReport,
);

reportsRouter.get(
  "/products",
  requireFinancialReporting,
  validateQuery(topProductsReportQuerySchema),
  reportsController.getTopProductsReport,
);

reportsRouter.get(
  "/purchases",
  requireFinancialReporting,
  validateQuery(purchasesReportQuerySchema),
  reportsController.getPurchasesReport,
);

reportsRouter.get(
  "/purchases/export",
  requireFinancialReporting,
  validateQuery(reportExportQuerySchema),
  reportsController.exportPurchasesReport,
);

reportsRouter.get(
  "/expenses",
  requireFinancialReporting,
  validateQuery(expensesReportQuerySchema),
  reportsController.getExpensesReport,
);

reportsRouter.get(
  "/expenses/export",
  requireFinancialReporting,
  validateQuery(reportExportQuerySchema),
  reportsController.exportExpensesReport,
);

reportsRouter.get(
  "/receivables",
  requireFinancialReporting,
  reportsController.getReceivablesReport,
);

reportsRouter.get(
  "/wallets",
  requireFinancialReporting,
  reportsController.getWalletsReport,
);

reportsRouter.get(
  "/payables",
  requireFinancialReporting,
  reportsController.getPayablesReport,
);

reportsRouter.get(
  "/inventory",
  requireFinancialReporting,
  reportsController.getInventoryReport,
);

reportsRouter.get(
  "/daily",
  requireFinancialReporting,
  validateQuery(dailyReportQuerySchema),
  reportsController.getDailyReport,
);
