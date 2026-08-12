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
import { expenseCategoriesRouter } from "../expenses/expense-category.routes.js";
import { expensesRouter } from "../expenses/expense.routes.js";
import { reportsRouter } from "../reports/reports.routes.js";
import { refundsRouter, supplierReturnsRouter } from "../reversals/reversal.routes.js";
import { businessWalletsRouter } from "../wallet/wallet.routes.js";

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
businessScopedRouter.use("/expense-categories", expenseCategoriesRouter);
businessScopedRouter.use("/expenses", expensesRouter);
businessScopedRouter.use("/reports", reportsRouter);
businessScopedRouter.use("/refunds", refundsRouter);
businessScopedRouter.use("/supplier-returns", supplierReturnsRouter);
businessScopedRouter.use("/wallets", businessWalletsRouter);

businessesRouter.use("/:businessId", businessScopedRouter);
