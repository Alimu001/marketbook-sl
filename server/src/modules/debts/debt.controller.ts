import type { NextFunction, Request, Response } from "express";
import type {
  ListBusinessDebtsQuery,
  ListDebtPaymentsQuery,
} from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as debtService from "./debt.service.js";

function getBusinessId(req: Request): string {
  const businessId = req.business?.id;

  if (!businessId) {
    throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
  }

  return businessId;
}

function getUserId(req: Request): string {
  const userId = req.auth?.userId;

  if (!userId) {
    throw new AppError(401, "Authentication required", "UNAUTHORIZED");
  }

  return userId;
}

function getDebtId(req: Request): string {
  const debtId = getRouteParam(req.params.debtId);

  if (!debtId) {
    throw new AppError(400, "Debt ID is required", "VALIDATION_ERROR");
  }

  return debtId;
}

export async function listBusinessDebts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await debtService.listBusinessDebts(
      getBusinessId(req),
      req.validatedQuery as ListBusinessDebtsQuery,
    );
    res.status(200).json({
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    next(error);
  }
}

export async function getDebtDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const debt = await debtService.getDebtDetail(
      getBusinessId(req),
      getDebtId(req),
    );
    res.status(200).json({ data: debt });
  } catch (error) {
    next(error);
  }
}

export async function recordDebtPayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await debtService.recordDebtPayment(
      getBusinessId(req),
      getDebtId(req),
      getUserId(req),
      req.body,
    );
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function listDebtPayments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await debtService.listDebtPayments(
      getBusinessId(req),
      getDebtId(req),
      req.validatedQuery as ListDebtPaymentsQuery,
    );
    res.status(200).json({
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    next(error);
  }
}
