import { Router } from "express";
import {
  createSupplierSchema,
  listSupplierPayablesQuerySchema,
  listSuppliersQuerySchema,
  updateSupplierSchema,
} from "@marketbook/shared/validation";
import { requireBusinessRole } from "../../middleware/businessAuth.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as supplierController from "./supplier.controller.js";

export const suppliersRouter = Router({ mergeParams: true });

suppliersRouter.post(
  "/",
  validate(createSupplierSchema),
  supplierController.createSupplier,
);

suppliersRouter.get(
  "/",
  validateQuery(listSuppliersQuerySchema),
  supplierController.listSuppliers,
);

suppliersRouter.get("/:supplierId", supplierController.getSupplier);

suppliersRouter.patch(
  "/:supplierId",
  requireBusinessRole("owner", "admin", "staff"),
  validate(updateSupplierSchema),
  supplierController.updateSupplier,
);

suppliersRouter.patch(
  "/:supplierId/archive",
  requireBusinessRole("owner", "admin"),
  supplierController.archiveSupplier,
);

suppliersRouter.patch(
  "/:supplierId/restore",
  requireBusinessRole("owner", "admin"),
  supplierController.restoreSupplier,
);

suppliersRouter.get(
  "/:supplierId/payables",
  validateQuery(listSupplierPayablesQuerySchema),
  supplierController.listSupplierPayables,
);

suppliersRouter.get(
  "/:supplierId/history",
  supplierController.getSupplierHistory,
);
