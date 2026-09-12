import type { NextFunction, Request, Response } from "express";
import type {
  ListSuppliersQuery,
  ListSupplierPayablesQuery,
} from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getIdempotencyKeyFromRequest } from "../../lib/clientMutation.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as supplierService from "./supplier.service.js";
import * as payableService from "../payables/payable.service.js";

function getBusinessId(req: Request): string {
  const businessId = req.business?.id;

  if (!businessId) {
    throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
  }

  return businessId;
}

function getSupplierId(req: Request): string {
  const supplierId = getRouteParam(req.params.supplierId);

  if (!supplierId) {
    throw new AppError(400, "Supplier ID is required", "VALIDATION_ERROR");
  }

  return supplierId;
}

function getUserId(req: Request): string {
  const userId = req.auth?.userId;

  if (!userId) {
    throw new AppError(401, "Authentication required", "UNAUTHORIZED");
  }

  return userId;
}

export async function createSupplier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const supplier = await supplierService.createSupplier(
      getBusinessId(req),
      getUserId(req),
      req.body,
      { mutationId: getIdempotencyKeyFromRequest(req.headers) },
    );
    res.status(201).json({ data: supplier });
  } catch (error) {
    next(error);
  }
}

export async function listSuppliers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await supplierService.listSuppliers(
      getBusinessId(req),
      req.validatedQuery as ListSuppliersQuery,
    );
    res.status(200).json({
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSupplier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const supplier = await supplierService.getSupplierDetail(
      getBusinessId(req),
      getSupplierId(req),
    );
    res.status(200).json({ data: supplier });
  } catch (error) {
    next(error);
  }
}

export async function updateSupplier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const supplier = await supplierService.updateSupplier(
      getBusinessId(req),
      getSupplierId(req),
      req.body,
    );
    res.status(200).json({ data: supplier });
  } catch (error) {
    next(error);
  }
}

export async function archiveSupplier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const supplier = await supplierService.archiveSupplier(
      getBusinessId(req),
      getSupplierId(req),
    );
    res.status(200).json({ data: supplier });
  } catch (error) {
    next(error);
  }
}

export async function restoreSupplier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const supplier = await supplierService.restoreSupplier(
      getBusinessId(req),
      getSupplierId(req),
    );
    res.status(200).json({ data: supplier });
  } catch (error) {
    next(error);
  }
}

export async function listSupplierPayables(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await payableService.listSupplierPayables(
      getBusinessId(req),
      getSupplierId(req),
      req.validatedQuery as ListSupplierPayablesQuery,
    );
    res.status(200).json({
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSupplierHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const history = await supplierService.getSupplierHistory(
      getBusinessId(req),
      getSupplierId(req),
    );
    res.status(200).json({ data: history });
  } catch (error) {
    next(error);
  }
}
