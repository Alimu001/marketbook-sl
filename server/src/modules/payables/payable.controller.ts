import type { NextFunction, Request, Response } from "express";
import type {
  ListBusinessPayablesQuery,
  ListSupplierPaymentsQuery,
} from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as payableService from "./payable.service.js";

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

function getPayableId(req: Request): string {
  const payableId = getRouteParam(req.params.payableId);

  if (!payableId) {
    throw new AppError(400, "Payable ID is required", "VALIDATION_ERROR");
  }

  return payableId;
}

export async function listBusinessPayables(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await payableService.listBusinessPayables(
      getBusinessId(req),
      req.validatedQuery as ListBusinessPayablesQuery,
    );
    res.status(200).json({
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    next(error);
  }
}

export async function getPayableDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payable = await payableService.getPayableDetail(
      getBusinessId(req),
      getPayableId(req),
    );
    res.status(200).json({ data: payable });
  } catch (error) {
    next(error);
  }
}

export async function recordSupplierPayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await payableService.recordSupplierPayment(
      getBusinessId(req),
      getPayableId(req),
      getUserId(req),
      req.body,
    );
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function listSupplierPayments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await payableService.listSupplierPayments(
      getBusinessId(req),
      getPayableId(req),
      req.validatedQuery as ListSupplierPaymentsQuery,
    );
    res.status(200).json({
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    next(error);
  }
}
