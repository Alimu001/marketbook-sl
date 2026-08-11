import type { NextFunction, Request, Response } from "express";
import type {
  ListCustomersQuery,
  ListCustomerDebtsQuery,
} from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as customerService from "./customer.service.js";
import * as debtService from "../debts/debt.service.js";

function getBusinessId(req: Request): string {
  const businessId = req.business?.id;

  if (!businessId) {
    throw new AppError(500, "Business context is missing", "INTERNAL_ERROR");
  }

  return businessId;
}

function getCustomerId(req: Request): string {
  const customerId = getRouteParam(req.params.customerId);

  if (!customerId) {
    throw new AppError(400, "Customer ID is required", "VALIDATION_ERROR");
  }

  return customerId;
}

export async function createCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customer = await customerService.createCustomer(
      getBusinessId(req),
      req.body,
    );
    res.status(201).json({ data: customer });
  } catch (error) {
    next(error);
  }
}

export async function listCustomers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await customerService.listCustomers(
      getBusinessId(req),
      req.validatedQuery as ListCustomersQuery,
    );
    res.status(200).json({
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customer = await customerService.getCustomerDetail(
      getBusinessId(req),
      getCustomerId(req),
    );
    res.status(200).json({ data: customer });
  } catch (error) {
    next(error);
  }
}

export async function updateCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customer = await customerService.updateCustomer(
      getBusinessId(req),
      getCustomerId(req),
      req.body,
    );
    res.status(200).json({ data: customer });
  } catch (error) {
    next(error);
  }
}

export async function archiveCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customer = await customerService.archiveCustomer(
      getBusinessId(req),
      getCustomerId(req),
    );
    res.status(200).json({ data: customer });
  } catch (error) {
    next(error);
  }
}

export async function restoreCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const customer = await customerService.restoreCustomer(
      getBusinessId(req),
      getCustomerId(req),
    );
    res.status(200).json({ data: customer });
  } catch (error) {
    next(error);
  }
}

export async function listCustomerDebts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await debtService.listCustomerDebts(
      getBusinessId(req),
      getCustomerId(req),
      req.validatedQuery as ListCustomerDebtsQuery,
    );
    res.status(200).json({
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCustomerHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const history = await customerService.getCustomerHistory(
      getBusinessId(req),
      getCustomerId(req),
    );
    res.status(200).json({ data: history });
  } catch (error) {
    next(error);
  }
}
