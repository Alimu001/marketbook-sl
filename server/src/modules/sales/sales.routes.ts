import { Router } from "express";
import {
  createSaleSchema,
  listSalesQuerySchema,
} from "@marketbook/shared/validation";
import { validate, validateQuery } from "../../middleware/validate.js";
import { saleReversalRouter } from "../reversals/reversal.routes.js";
import * as salesController from "./sales.controller.js";
import * as receiptController from "../receipts/receipt.controller.js";

export const salesRouter = Router({ mergeParams: true });

salesRouter.post("/", validate(createSaleSchema), salesController.createSale);

salesRouter.get(
  "/",
  validateQuery(listSalesQuerySchema),
  salesController.listSales,
);

salesRouter.get("/:saleId/receipt", receiptController.getReceipt);
salesRouter.get("/:saleId/receipt/print", receiptController.printReceipt);
salesRouter.get("/:saleId", salesController.getSaleDetail);

salesRouter.use("/:saleId", saleReversalRouter);
