import type { NextFunction, Request, Response } from "express";
import type {
  ListPaymentsQuery,
  PaymentsReportQuery,
} from "@marketbook/shared/validation";
import { orangeMoneyCallbackSchema } from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import * as paymentService from "./payment.service.js";

function getUserId(req: Request): string {
  const userId = req.auth?.userId;

  if (!userId) {
    throw new AppError(401, "Authentication required", "UNAUTHORIZED");
  }

  return userId;
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
    const businessId = req.params.businessId!;
    const userId = getUserId(req);
    const data = await paymentService.initiatePayment(businessId, userId, req.body);
    res.status(201).json({ data: data.payment });
  } catch (error) {
    next(error);
  }
}

export async function getPayment(req: Request, res: Response) {
  const businessId = req.params.businessId!;
  const paymentId = req.params.paymentId!;
  const data = await paymentService.getPaymentDetail(businessId, paymentId);
  res.json({ data });
}

export async function listPayments(req: Request, res: Response) {
  const businessId = req.params.businessId!;
  const query = req.validatedQuery as ListPaymentsQuery;
  const data = await paymentService.listPayments(businessId, query);
  res.json({ data });
}

export async function reconcilePayment(req: Request, res: Response) {
  const businessId = req.params.businessId!;
  const paymentId = req.params.paymentId!;
  const data = await paymentService.reconcilePayment(businessId, paymentId);
  res.json({ data });
}

export async function getPaymentsReport(req: Request, res: Response) {
  const businessId = req.params.businessId!;
  const query = req.validatedQuery as PaymentsReportQuery;
  const data = await paymentService.getPaymentsReport(businessId, query);
  res.json({ data });
}

export async function handleOrangeMoneyCallback(req: Request, res: Response) {
  const payload = orangeMoneyCallbackSchema.parse(req.body);
  await paymentService.handleOrangeMoneyCallback(payload);
  res.status(200).json({ status: "ok" });
}
