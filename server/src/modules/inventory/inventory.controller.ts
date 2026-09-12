import type { NextFunction, Request, Response } from "express";
import type {
  InventoryHistoryQuery,
  ListInventoryQuery,
} from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as inventoryService from "./inventory.service.js";

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

function getProductId(req: Request): string {
  const productId = getRouteParam(req.params.productId);

  if (!productId) {
    throw new AppError(400, "Product ID is required", "VALIDATION_ERROR");
  }

  return productId;
}

export async function listInventory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await inventoryService.listInventory(
      getBusinessId(req),
      req.validatedQuery as ListInventoryQuery,
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

export async function getInventoryBalance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const balance = await inventoryService.getInventoryBalance(
      getBusinessId(req),
      getProductId(req),
    );
    res.status(200).json({ data: balance });
  } catch (error) {
    next(error);
  }
}

export async function setOpeningStock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const balance = await inventoryService.setOpeningStock(
      getBusinessId(req),
      getProductId(req),
      getUserId(req),
      req.body,
    );
    res.status(201).json({ data: balance });
  } catch (error) {
    next(error);
  }
}

export async function adjustInventory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const balance = await inventoryService.adjustInventory(
      getBusinessId(req),
      getProductId(req),
      getUserId(req),
      req.body,
    );
    res.status(200).json({ data: balance });
  } catch (error) {
    next(error);
  }
}

export async function updateLowStockThreshold(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const balance = await inventoryService.updateLowStockThreshold(
      getBusinessId(req),
      getProductId(req),
      req.body,
    );
    res.status(200).json({ data: balance });
  } catch (error) {
    next(error);
  }
}

export async function getInventoryHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await inventoryService.getInventoryHistory(
      getBusinessId(req),
      getProductId(req),
      req.validatedQuery as InventoryHistoryQuery,
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
