import type { NextFunction, Request, Response } from "express";
import type { ListProductsQuery } from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as productService from "./product.service.js";

function getBusinessId(req: Request): string {
  const businessId = req.business?.id;

  if (!businessId) {
    throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
  }

  return businessId;
}

export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const product = await productService.createProduct(
      getBusinessId(req),
      req.body,
    );
    res.status(201).json({ data: product });
  } catch (error) {
    next(error);
  }
}

export async function listProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await productService.listProducts(
      getBusinessId(req),
      req.validatedQuery as ListProductsQuery,
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

export async function getProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const productId = getRouteParam(req.params.productId);

    if (!productId) {
      throw new AppError(400, "Product ID is required", "VALIDATION_ERROR");
    }

    const product = await productService.getProduct(
      getBusinessId(req),
      productId,
    );
    res.status(200).json({ data: product });
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const productId = getRouteParam(req.params.productId);

    if (!productId) {
      throw new AppError(400, "Product ID is required", "VALIDATION_ERROR");
    }

    const product = await productService.updateProduct(
      getBusinessId(req),
      productId,
      req.body,
    );
    res.status(200).json({ data: product });
  } catch (error) {
    next(error);
  }
}

export async function archiveProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const productId = getRouteParam(req.params.productId);

    if (!productId) {
      throw new AppError(400, "Product ID is required", "VALIDATION_ERROR");
    }

    const product = await productService.archiveProduct(
      getBusinessId(req),
      productId,
    );
    res.status(200).json({ data: product });
  } catch (error) {
    next(error);
  }
}

export async function restoreProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const productId = getRouteParam(req.params.productId);

    if (!productId) {
      throw new AppError(400, "Product ID is required", "VALIDATION_ERROR");
    }

    const product = await productService.restoreProduct(
      getBusinessId(req),
      productId,
    );
    res.status(200).json({ data: product });
  } catch (error) {
    next(error);
  }
}
