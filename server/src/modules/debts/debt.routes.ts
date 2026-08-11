import { Router } from "express";
import {
  listBusinessDebtsQuerySchema,
  listDebtPaymentsQuerySchema,
  recordDebtPaymentSchema,
} from "@marketbook/shared/validation";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as debtController from "./debt.controller.js";

export const businessDebtsRouter = Router({ mergeParams: true });

businessDebtsRouter.get(
  "/",
  validateQuery(listBusinessDebtsQuerySchema),
  debtController.listBusinessDebts,
);

businessDebtsRouter.get(
  "/:debtId/payments",
  validateQuery(listDebtPaymentsQuerySchema),
  debtController.listDebtPayments,
);

businessDebtsRouter.post(
  "/:debtId/payments",
  validate(recordDebtPaymentSchema),
  debtController.recordDebtPayment,
);

businessDebtsRouter.get("/:debtId", debtController.getDebtDetail);
