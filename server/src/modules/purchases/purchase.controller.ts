import type { NextFunction, Request, Response } from "express";
import type { ListPurchasesQuery } from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as purchaseService from "./purchase.service.js";

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

function getPurchaseId(req: Request): string {
  const purchaseId = getRouteParam(req.params.purchaseId);

  if (!purchaseId) {
    throw new AppError(400, "Purchase ID is required", "VALIDATION_ERROR");
  }

  return purchaseId;
}

export async function createPurchase(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await purchaseService.createPurchase(
      getBusinessId(req),
      getUserId(req),
      req.body,
    );
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function listPurchases(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await purchaseService.listPurchases(
      getBusinessId(req),
      req.validatedQuery as ListPurchasesQuery,
    );
    res.status(200).json({
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getPurchaseDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const purchase = await purchaseService.getPurchaseDetail(
      getBusinessId(req),
      getPurchaseId(req),
    );
    res.status(200).json({ data: purchase });
  } catch (error) {
    next(error);
  }
}
