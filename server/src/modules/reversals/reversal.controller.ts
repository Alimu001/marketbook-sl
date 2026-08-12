import type { NextFunction, Request, Response } from "express";
import type { ListRefundsQuery, ListSupplierReturnsQuery } from "@marketbook/shared/validation";
import { getRouteParam } from "../../lib/routeParams.js";
import { AppError } from "../../middleware/errorHandler.js";
import * as refundService from "./refund.service.js";
import * as supplierReturnService from "./supplierReturn.service.js";
import * as voidService from "./void.service.js";

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

function getPurchaseId(req: Request): string {
  const purchaseId = getRouteParam(req.params.purchaseId);

  if (!purchaseId) {
    throw new AppError(400, "Purchase ID is required", "VALIDATION_ERROR");
  }

  return purchaseId;
}

function getRefundId(req: Request): string {
  const refundId = getRouteParam(req.params.refundId);

  if (!refundId) {
    throw new AppError(400, "Refund ID is required", "VALIDATION_ERROR");
  }

  return refundId;
}

function getReturnId(req: Request): string {
  const returnId = getRouteParam(req.params.returnId);

  if (!returnId) {
    throw new AppError(400, "Return ID is required", "VALIDATION_ERROR");
  }

  return returnId;
}

export async function createSaleRefund(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await refundService.createSaleRefund(
      getBusinessId(req),
      getSaleId(req),
      getUserId(req),
      req.body,
    );
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function listSaleRefunds(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const refunds = await refundService.listSaleRefunds(
      getBusinessId(req),
      getSaleId(req),
    );
    res.status(200).json({ data: { refunds } });
  } catch (error) {
    next(error);
  }
}

export async function getSaleReversalSummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const summary = await refundService.getSaleReversalSummary(
      getBusinessId(req),
      getSaleId(req),
    );
    res.status(200).json({ data: summary });
  } catch (error) {
    next(error);
  }
}

export async function listBusinessRefunds(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await refundService.listBusinessRefunds(
      getBusinessId(req),
      req.validatedQuery as ListRefundsQuery,
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

export async function getRefundDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const refund = await refundService.getSaleRefundDetail(
      getBusinessId(req),
      getRefundId(req),
    );
    res.status(200).json({ data: { refund } });
  } catch (error) {
    next(error);
  }
}

export async function voidSale(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await voidService.voidSale(
      getBusinessId(req),
      getSaleId(req),
      getUserId(req),
      req.body,
    );
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getSaleVoid(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const voidRecord = await voidService.getSaleVoid(
      getBusinessId(req),
      getSaleId(req),
    );
    res.status(200).json({ data: { void: voidRecord } });
  } catch (error) {
    next(error);
  }
}

export async function voidPurchase(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await voidService.voidPurchase(
      getBusinessId(req),
      getPurchaseId(req),
      getUserId(req),
      req.body,
    );
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getPurchaseVoid(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const voidRecord = await voidService.getPurchaseVoid(
      getBusinessId(req),
      getPurchaseId(req),
    );
    res.status(200).json({ data: { void: voidRecord } });
  } catch (error) {
    next(error);
  }
}

export async function createSupplierReturn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await supplierReturnService.createSupplierReturn(
      getBusinessId(req),
      getPurchaseId(req),
      getUserId(req),
      req.body,
    );
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function listPurchaseReturns(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const returns = await supplierReturnService.listPurchaseReturns(
      getBusinessId(req),
      getPurchaseId(req),
    );
    res.status(200).json({ data: { returns } });
  } catch (error) {
    next(error);
  }
}

export async function getPurchaseReturnSummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const summary = await supplierReturnService.getPurchaseReturnSummary(
      getBusinessId(req),
      getPurchaseId(req),
    );
    res.status(200).json({ data: summary });
  } catch (error) {
    next(error);
  }
}

export async function listBusinessSupplierReturns(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await supplierReturnService.listBusinessSupplierReturns(
      getBusinessId(req),
      req.validatedQuery as ListSupplierReturnsQuery,
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

export async function getSupplierReturnDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const supplierReturn = await supplierReturnService.getSupplierReturnDetail(
      getBusinessId(req),
      getReturnId(req),
    );
    res.status(200).json({ data: { supplierReturn } });
  } catch (error) {
    next(error);
  }
}
