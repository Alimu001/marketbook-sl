import { Router } from "express";
import {
  createSaleRefundSchema,
  createSupplierReturnSchema,
  listRefundsQuerySchema,
  listSupplierReturnsQuerySchema,
  purchaseVoidSchema,
  saleVoidSchema,
} from "@marketbook/shared/validation";
import {
  requireBusinessRole,
} from "../../middleware/businessAuth.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as reversalController from "./reversal.controller.js";

export const supplierReturnsRouter = Router({ mergeParams: true });

supplierReturnsRouter.get(
  "/",
  validateQuery(listSupplierReturnsQuerySchema),
  reversalController.listBusinessSupplierReturns,
);

supplierReturnsRouter.get("/:returnId", reversalController.getSupplierReturnDetail);

export const refundsRouter = Router({ mergeParams: true });

refundsRouter.get(
  "/",
  validateQuery(listRefundsQuerySchema),
  reversalController.listBusinessRefunds,
);

refundsRouter.get("/:refundId", reversalController.getRefundDetail);

export const saleReversalRouter = Router({ mergeParams: true });

saleReversalRouter.get(
  "/reversal-summary",
  reversalController.getSaleReversalSummary,
);

saleReversalRouter.get("/refunds", reversalController.listSaleRefunds);

saleReversalRouter.post(
  "/refunds",
  requireBusinessRole("owner", "admin", "staff"),
  validate(createSaleRefundSchema),
  reversalController.createSaleRefund,
);

saleReversalRouter.get("/void", reversalController.getSaleVoid);

saleReversalRouter.post(
  "/void",
  requireBusinessRole("owner", "admin"),
  validate(saleVoidSchema),
  reversalController.voidSale,
);

export const purchaseReversalRouter = Router({ mergeParams: true });

purchaseReversalRouter.get("/void", reversalController.getPurchaseVoid);

purchaseReversalRouter.get(
  "/return-summary",
  reversalController.getPurchaseReturnSummary,
);

purchaseReversalRouter.get("/returns", reversalController.listPurchaseReturns);

purchaseReversalRouter.post(
  "/returns",
  requireBusinessRole("owner", "admin", "staff"),
  validate(createSupplierReturnSchema),
  reversalController.createSupplierReturn,
);

purchaseReversalRouter.post(
  "/void",
  requireBusinessRole("owner", "admin"),
  validate(purchaseVoidSchema),
  reversalController.voidPurchase,
);
