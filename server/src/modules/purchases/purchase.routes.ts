import { Router } from "express";
import {
  createPurchaseSchema,
  listPurchasesQuerySchema,
} from "@marketbook/shared/validation";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as purchaseController from "./purchase.controller.js";

export const purchasesRouter = Router({ mergeParams: true });

purchasesRouter.post(
  "/",
  validate(createPurchaseSchema),
  purchaseController.createPurchase,
);

purchasesRouter.get(
  "/",
  validateQuery(listPurchasesQuerySchema),
  purchaseController.listPurchases,
);

purchasesRouter.get("/:purchaseId", purchaseController.getPurchaseDetail);
