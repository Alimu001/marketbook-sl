import { Router } from "express";
import {
  initiatePaymentSchema,
  listPaymentsQuerySchema,
  paymentsReportQuerySchema,
} from "@marketbook/shared/validation";
import { validate, validateQuery } from "../../middleware/validate.js";
import {
  requireBusinessMembership,
  requireBusinessRole,
} from "../../middleware/businessAuth.js";
import * as paymentController from "./payment.controller.js";

export const paymentsRouter = Router({ mergeParams: true });

paymentsRouter.use(requireBusinessMembership);

paymentsRouter.get("/providers", paymentController.listConfiguredProviders);

paymentsRouter.post(
  "/",
  validate(initiatePaymentSchema),
  paymentController.initiatePayment,
);

paymentsRouter.get(
  "/",
  validateQuery(listPaymentsQuerySchema),
  paymentController.listPayments,
);

paymentsRouter.get("/:paymentId", paymentController.getPayment);

paymentsRouter.post(
  "/:paymentId/reconcile",
  requireBusinessRole("owner", "admin"),
  paymentController.reconcilePayment,
);

export const paymentReportsRouter = Router({ mergeParams: true });

paymentReportsRouter.use(requireBusinessMembership);
paymentReportsRouter.get(
  "/payments",
  validateQuery(paymentsReportQuerySchema),
  paymentController.getPaymentsReport,
);

export const orangeMoneyCallbackRouter = Router();

orangeMoneyCallbackRouter.post(
  "/callback",
  paymentController.handleOrangeMoneyCallback,
);
