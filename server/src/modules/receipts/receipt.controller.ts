import type { NextFunction, Request, Response } from "express";
import { getRouteParam } from "../../lib/routeParams.js";
import { AppError } from "../../middleware/errorHandler.js";
import { renderSaleReceiptHtml } from "./receipt.renderer.js";
import { getSaleReceipt } from "./receipt.service.js";

function getContext(req: Request): { businessId: string; saleId: string } {
  const businessId = req.business?.id;
  const saleId = getRouteParam(req.params.saleId);

  if (!businessId) {
    throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
  }

  if (!saleId) {
    throw new AppError(400, "Sale ID is required", "VALIDATION_ERROR");
  }

  return { businessId, saleId };
}

export async function getReceipt(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { businessId, saleId } = getContext(req);
    const receipt = await getSaleReceipt(businessId, saleId);
    res.status(200).json({ data: receipt });
  } catch (error) {
    next(error);
  }
}

export async function printReceipt(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { businessId, saleId } = getContext(req);
    const receipt = await getSaleReceipt(businessId, saleId);
    const safeFilename = receipt.receiptNumber.replace(/[^a-zA-Z0-9_-]/g, "-");

    res
      .status(200)
      .set({
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="receipt-${safeFilename}.html"`,
        "Cache-Control": "private, no-store",
      })
      .send(renderSaleReceiptHtml(receipt));
  } catch (error) {
    next(error);
  }
}
