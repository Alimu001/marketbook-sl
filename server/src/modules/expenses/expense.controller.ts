import type { NextFunction, Request, Response } from "express";
import type { ListExpensesQuery } from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as expenseService from "./expense.service.js";

function getBusinessId(req: Request): string {
  const businessId = req.business?.id;

  if (!businessId) {
    throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
  }

  return businessId;
}

function getExpenseId(req: Request): string {
  const expenseId = getRouteParam(req.params.expenseId);

  if (!expenseId) {
    throw new AppError(400, "Expense ID is required", "VALIDATION_ERROR");
  }

  return expenseId;
}

function getRecordedByUserId(req: Request): string {
  const userId = req.auth?.userId;

  if (!userId) {
    throw new AppError(401, "Authentication required", "UNAUTHORIZED");
  }

  return userId;
}

export async function createExpense(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const expense = await expenseService.createExpense(
      getBusinessId(req),
      getRecordedByUserId(req),
      req.body,
    );
    res.status(201).json({ data: expense });
  } catch (error) {
    next(error);
  }
}

export async function listExpenses(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await expenseService.listExpenses(
      getBusinessId(req),
      req.validatedQuery as ListExpensesQuery,
    );
    res.status(200).json({
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    next(error);
  }
}

export async function getExpense(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const expense = await expenseService.getExpenseDetail(
      getBusinessId(req),
      getExpenseId(req),
    );
    res.status(200).json({ data: expense });
  } catch (error) {
    next(error);
  }
}

export async function updateExpense(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const expense = await expenseService.updateExpense(
      getBusinessId(req),
      getExpenseId(req),
      req.body,
    );
    res.status(200).json({ data: expense });
  } catch (error) {
    next(error);
  }
}

export async function archiveExpense(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const expense = await expenseService.archiveExpense(
      getBusinessId(req),
      getExpenseId(req),
    );
    res.status(200).json({ data: expense });
  } catch (error) {
    next(error);
  }
}

export async function restoreExpense(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const expense = await expenseService.restoreExpense(
      getBusinessId(req),
      getExpenseId(req),
    );
    res.status(200).json({ data: expense });
  } catch (error) {
    next(error);
  }
}
