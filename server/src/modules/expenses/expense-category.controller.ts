import type { NextFunction, Request, Response } from "express";
import type { ListExpenseCategoriesQuery } from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as expenseCategoryService from "./expense-category.service.js";

function getBusinessId(req: Request): string {
  const businessId = req.business?.id;

  if (!businessId) {
    throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
  }

  return businessId;
}

function getCategoryId(req: Request): string {
  const categoryId = getRouteParam(req.params.categoryId);

  if (!categoryId) {
    throw new AppError(400, "Category ID is required", "VALIDATION_ERROR");
  }

  return categoryId;
}

export async function createExpenseCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const category = await expenseCategoryService.createExpenseCategory(
      getBusinessId(req),
      req.body,
    );
    res.status(201).json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function listExpenseCategories(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const categories = await expenseCategoryService.listExpenseCategories(
      getBusinessId(req),
      req.validatedQuery as ListExpenseCategoriesQuery,
    );
    res.status(200).json({ data: categories });
  } catch (error) {
    next(error);
  }
}

export async function updateExpenseCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const category = await expenseCategoryService.updateExpenseCategory(
      getBusinessId(req),
      getCategoryId(req),
      req.body,
    );
    res.status(200).json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function archiveExpenseCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const category = await expenseCategoryService.archiveExpenseCategory(
      getBusinessId(req),
      getCategoryId(req),
    );
    res.status(200).json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function restoreExpenseCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const category = await expenseCategoryService.restoreExpenseCategory(
      getBusinessId(req),
      getCategoryId(req),
    );
    res.status(200).json({ data: category });
  } catch (error) {
    next(error);
  }
}
