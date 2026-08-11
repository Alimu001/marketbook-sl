import { Router } from "express";
import {
  createSaleSchema,
  listSalesQuerySchema,
} from "@marketbook/shared/validation";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as salesController from "./sales.controller.js";

export const salesRouter = Router({ mergeParams: true });

salesRouter.post("/", validate(createSaleSchema), salesController.createSale);

salesRouter.get(
  "/",
  validateQuery(listSalesQuerySchema),
  salesController.listSales,
);

salesRouter.get("/:saleId", salesController.getSaleDetail);
