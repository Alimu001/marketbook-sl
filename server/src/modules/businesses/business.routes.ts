import { Router } from "express";
import {
  createBusinessSchema,
  updateBusinessSchema,
  updateMemberRoleSchema,
} from "@marketbook/shared/validation";
import { authenticate } from "../../middleware/auth.js";
import {
  requireBusinessMembership,
  requireBusinessRole,
} from "../../middleware/businessAuth.js";
import { validate } from "../../middleware/validate.js";
import * as businessController from "./business.controller.js";
import { productsRouter } from "../products/product.routes.js";
import { inventoryListRouter } from "../inventory/inventory.routes.js";
import { salesRouter } from "../sales/sales.routes.js";
import { customersRouter } from "../customers/customer.routes.js";
import { businessDebtsRouter } from "../debts/debt.routes.js";
import { suppliersRouter } from "../suppliers/supplier.routes.js";
import { purchasesRouter } from "../purchases/purchase.routes.js";
import { businessPayablesRouter } from "../payables/payable.routes.js";

export const businessesRouter = Router();

businessesRouter.use(authenticate);

businessesRouter.post(
  "/",
  validate(createBusinessSchema),
  businessController.createBusiness,
);
businessesRouter.get("/", businessController.listBusinesses);

const businessScopedRouter = Router({ mergeParams: true });

businessScopedRouter.use(requireBusinessMembership);

businessScopedRouter.get("/", businessController.getBusiness);
businessScopedRouter.patch(
  "/",
  requireBusinessRole("owner", "admin"),
  validate(updateBusinessSchema),
  businessController.updateBusiness,
);
businessScopedRouter.get("/members", businessController.listMembers);
businessScopedRouter.patch(
  "/members/:userId/role",
  requireBusinessRole("owner"),
  validate(updateMemberRoleSchema),
  businessController.updateMemberRole,
);
businessScopedRouter.delete(
  "/members/:userId",
  requireBusinessRole("owner", "admin"),
  businessController.removeMember,
);

businessScopedRouter.use("/inventory", inventoryListRouter);
businessScopedRouter.use("/products", productsRouter);
businessScopedRouter.use("/sales", salesRouter);
businessScopedRouter.use("/customers", customersRouter);
businessScopedRouter.use("/debts", businessDebtsRouter);
businessScopedRouter.use("/suppliers", suppliersRouter);
businessScopedRouter.use("/purchases", purchasesRouter);
businessScopedRouter.use("/payables", businessPayablesRouter);

businessesRouter.use("/:businessId", businessScopedRouter);
