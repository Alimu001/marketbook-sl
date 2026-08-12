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
import * as reportsController from "./reports.controller.js";

export const reportsRouter = Router({ mergeParams: true });

reportsRouter.get(
  "/dashboard",
  validateQuery(dashboardReportQuerySchema),
  reportsController.getDashboard,
);

reportsRouter.get(
  "/sales",
  validateQuery(salesReportQuerySchema),
  reportsController.getSalesReport,
);

reportsRouter.get(
  "/sales/export",
  validateQuery(reportExportQuerySchema),
  reportsController.exportSalesReport,
);

reportsRouter.get(
  "/products",
  validateQuery(topProductsReportQuerySchema),
  reportsController.getTopProductsReport,
);

reportsRouter.get(
  "/purchases",
  validateQuery(purchasesReportQuerySchema),
  reportsController.getPurchasesReport,
);

reportsRouter.get(
  "/purchases/export",
  validateQuery(reportExportQuerySchema),
  reportsController.exportPurchasesReport,
);

reportsRouter.get(
  "/expenses",
  validateQuery(expensesReportQuerySchema),
  reportsController.getExpensesReport,
);

reportsRouter.get(
  "/expenses/export",
  validateQuery(reportExportQuerySchema),
  reportsController.exportExpensesReport,
);

reportsRouter.get("/receivables", reportsController.getReceivablesReport);

reportsRouter.get("/wallets", reportsController.getWalletsReport);

reportsRouter.get("/payables", reportsController.getPayablesReport);

reportsRouter.get("/inventory", reportsController.getInventoryReport);

reportsRouter.get(
  "/daily",
  validateQuery(dailyReportQuerySchema),
  reportsController.getDailyReport,
);
