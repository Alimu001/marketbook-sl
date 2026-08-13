import type { NextFunction, Request, Response } from "express";
import type {
  ListPaymentsQuery,
  PaymentsReportQuery,
} from "@marketbook/shared/validation";
import { orangeMoneyCallbackSchema } from "@marketbook/shared/validation";
import { getRouteParam } from "../../lib/routeParams.js";
import { AppError } from "../../middleware/errorHandler.js";
import * as paymentService from "./payment.service.js";

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

function getPaymentId(req: Request): string {
  const paymentId = getRouteParam(req.params.paymentId);

  if (!paymentId) {
    throw new AppError(400, "Payment ID is required", "VALIDATION_ERROR");
  }

  return paymentId;
}

export async function listConfiguredProviders(_req: Request, res: Response) {
  const data = await paymentService.getConfiguredProviders();
  res.json({ data });
}

export async function initiatePayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);
    const data = await paymentService.initiatePayment(businessId, userId, req.body);
    res.status(201).json({ data: data.payment });
  } catch (error) {
    next(error);
  }
}

export async function getPayment(req: Request, res: Response) {
  const businessId = getBusinessId(req);
  const paymentId = getPaymentId(req);
  const data = await paymentService.getPaymentDetail(businessId, paymentId);
  res.json({ data });
}

export async function listPayments(req: Request, res: Response) {
  const businessId = getBusinessId(req);
  const query = req.validatedQuery as ListPaymentsQuery;
  const data = await paymentService.listPayments(businessId, query);
  res.json({ data });
}

export async function reconcilePayment(req: Request, res: Response) {
  const businessId = getBusinessId(req);
  const paymentId = getPaymentId(req);
  const data = await paymentService.reconcilePayment(businessId, paymentId);
  res.json({ data });
}

export async function getPaymentsReport(req: Request, res: Response) {
  const businessId = getBusinessId(req);
  const query = req.validatedQuery as PaymentsReportQuery;
  const data = await paymentService.getPaymentsReport(businessId, query);
  res.json({ data });
}

export async function handleOrangeMoneyCallback(req: Request, res: Response) {
  const payload = orangeMoneyCallbackSchema.parse(req.body);
  await paymentService.handleOrangeMoneyCallback(payload);
  res.status(200).json({ status: "ok" });
}
