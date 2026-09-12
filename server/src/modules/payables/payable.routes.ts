import { Router } from "express";
import {
  listBusinessPayablesQuerySchema,
  listSupplierPaymentsQuerySchema,
  recordSupplierPaymentSchema,
} from "@marketbook/shared/validation";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as payableController from "./payable.controller.js";

export const businessPayablesRouter = Router({ mergeParams: true });

businessPayablesRouter.get(
  "/",
  validateQuery(listBusinessPayablesQuerySchema),
  payableController.listBusinessPayables,
);

businessPayablesRouter.get(
  "/:payableId/payments",
  validateQuery(listSupplierPaymentsQuerySchema),
  payableController.listSupplierPayments,
);

businessPayablesRouter.post(
  "/:payableId/payments",
  validate(recordSupplierPaymentSchema),
  payableController.recordSupplierPayment,
);

businessPayablesRouter.get("/:payableId", payableController.getPayableDetail);
