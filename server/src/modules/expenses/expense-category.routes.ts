import { Router } from "express";
import {
  createExpenseCategorySchema,
  listExpenseCategoriesQuerySchema,
  updateExpenseCategorySchema,
} from "@marketbook/shared/validation";
import { requireBusinessRole } from "../../middleware/businessAuth.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as expenseCategoryController from "./expense-category.controller.js";

export const expenseCategoriesRouter = Router({ mergeParams: true });

expenseCategoriesRouter.post(
  "/",
  requireBusinessRole("owner", "admin"),
  validate(createExpenseCategorySchema),
  expenseCategoryController.createExpenseCategory,
);

expenseCategoriesRouter.get(
  "/",
  validateQuery(listExpenseCategoriesQuerySchema),
  expenseCategoryController.listExpenseCategories,
);

expenseCategoriesRouter.patch(
  "/:categoryId",
  requireBusinessRole("owner", "admin"),
  validate(updateExpenseCategorySchema),
  expenseCategoryController.updateExpenseCategory,
);

expenseCategoriesRouter.patch(
  "/:categoryId/archive",
  requireBusinessRole("owner", "admin"),
  expenseCategoryController.archiveExpenseCategory,
);

expenseCategoriesRouter.patch(
  "/:categoryId/restore",
  requireBusinessRole("owner", "admin"),
  expenseCategoryController.restoreExpenseCategory,
);
