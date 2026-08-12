import type { Request, Response, NextFunction } from "express";
import type {
  ManualWalletCreditInput,
  ManualWalletDebitInput,
  WalletHistoryQuery,
  ListBusinessWalletsQuery,
} from "@marketbook/shared/validation";
import { AppError } from "../../middleware/errorHandler.js";
import { getRouteParam } from "../../lib/routeParams.js";
import * as walletService from "./wallet.service.js";

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

function getUserId(req: Request): string {
  const userId = req.auth?.userId;

  if (!userId) {
    throw new AppError(401, "Authentication required", "UNAUTHORIZED");
  }

  return userId;
}

export async function getCustomerWallet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = await walletService.getCustomerWallet(
      getBusinessId(req),
      getCustomerId(req),
    );
    res.status(200).json({ data: wallet });
  } catch (error) {
    next(error);
  }
}

export async function getWalletHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const history = await walletService.getWalletHistory(
      getBusinessId(req),
      getCustomerId(req),
      req.validatedQuery as WalletHistoryQuery,
    );
    res.status(200).json({ data: history });
  } catch (error) {
    next(error);
  }
}

export async function manualCreditWallet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = await walletService.manualCreditWallet(
      getBusinessId(req),
      getCustomerId(req),
      getUserId(req),
      req.body as ManualWalletCreditInput,
    );
    res.status(201).json({ data: wallet });
  } catch (error) {
    next(error);
  }
}

export async function manualDebitWallet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallet = await walletService.manualDebitWallet(
      getBusinessId(req),
      getCustomerId(req),
      getUserId(req),
      req.body as ManualWalletDebitInput,
    );
    res.status(200).json({ data: wallet });
  } catch (error) {
    next(error);
  }
}

export async function listBusinessWallets(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const wallets = await walletService.listBusinessWallets(
      getBusinessId(req),
      req.validatedQuery as ListBusinessWalletsQuery,
    );
    res.status(200).json({ data: wallets });
  } catch (error) {
    next(error);
  }
}

export async function getWalletsReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await walletService.getWalletsReport(getBusinessId(req));
    res.status(200).json({ data: report });
  } catch (error) {
    next(error);
  }
}
