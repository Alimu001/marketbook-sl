import { Router } from "express";
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from "@marketbook/shared/validation";
import { requireBusinessRole } from "../../middleware/businessAuth.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as expenseController from "./expense.controller.js";

export const expensesRouter = Router({ mergeParams: true });

expensesRouter.post(
  "/",
  validate(createExpenseSchema),
  expenseController.createExpense,
);

expensesRouter.get(
  "/",
  validateQuery(listExpensesQuerySchema),
  expenseController.listExpenses,
);

expensesRouter.get("/:expenseId", expenseController.getExpense);

expensesRouter.patch(
  "/:expenseId",
  requireBusinessRole("owner", "admin", "staff"),
  validate(updateExpenseSchema),
  expenseController.updateExpense,
);

expensesRouter.patch(
  "/:expenseId/archive",
  requireBusinessRole("owner", "admin"),
  expenseController.archiveExpense,
);

expensesRouter.patch(
  "/:expenseId/restore",
  requireBusinessRole("owner", "admin"),
  expenseController.restoreExpense,
);
