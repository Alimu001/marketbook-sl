import { Router } from "express";
import {
  createCustomerSchema,
  listCustomerDebtsQuerySchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "@marketbook/shared/validation";
import { requireBusinessRole } from "../../middleware/businessAuth.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as customerController from "./customer.controller.js";

export const customersRouter = Router({ mergeParams: true });

customersRouter.post(
  "/",
  validate(createCustomerSchema),
  customerController.createCustomer,
);

customersRouter.get(
  "/",
  validateQuery(listCustomersQuerySchema),
  customerController.listCustomers,
);

customersRouter.get("/:customerId", customerController.getCustomer);

customersRouter.patch(
  "/:customerId",
  requireBusinessRole("owner", "admin", "staff"),
  validate(updateCustomerSchema),
  customerController.updateCustomer,
);

customersRouter.patch(
  "/:customerId/archive",
  requireBusinessRole("owner", "admin"),
  customerController.archiveCustomer,
);

customersRouter.patch(
  "/:customerId/restore",
  requireBusinessRole("owner", "admin"),
  customerController.restoreCustomer,
);

customersRouter.get(
  "/:customerId/debts",
  validateQuery(listCustomerDebtsQuerySchema),
  customerController.listCustomerDebts,
);

customersRouter.get(
  "/:customerId/history",
  customerController.getCustomerHistory,
);
