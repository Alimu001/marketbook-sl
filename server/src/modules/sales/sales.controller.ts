import type { NextFunction, Request, Response } from "express";
import type { ListSalesQuery } from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as salesService from "./sales.service.js";

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

function getSaleId(req: Request): string {
  const saleId = getRouteParam(req.params.saleId);

  if (!saleId) {
    throw new AppError(400, "Sale ID is required", "VALIDATION_ERROR");
  }

  return saleId;
}

export async function createSale(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await salesService.createSale(
      getBusinessId(req),
      getUserId(req),
      req.body,
    );
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function listSales(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await salesService.listSales(
      getBusinessId(req),
      req.validatedQuery as ListSalesQuery,
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

export async function getSaleDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sale = await salesService.getSaleDetail(
      getBusinessId(req),
      getSaleId(req),
    );
    res.status(200).json({ data: sale });
  } catch (error) {
    next(error);
  }
}
