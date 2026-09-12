import { Router } from "express";
import {
  listBusinessWalletsQuerySchema,
  manualWalletCreditSchema,
  manualWalletDebitSchema,
  walletHistoryQuerySchema,
} from "@marketbook/shared/validation";
import { requireBusinessRole } from "../../middleware/businessAuth.js";
import { validate, validateQuery } from "../../middleware/validate.js";
import * as walletController from "./wallet.controller.js";

export const customerWalletRouter = Router({ mergeParams: true });

customerWalletRouter.get("/", walletController.getCustomerWallet);

customerWalletRouter.get(
  "/history",
  validateQuery(walletHistoryQuerySchema),
  walletController.getWalletHistory,
);

customerWalletRouter.post(
  "/credit",
  requireBusinessRole("owner", "admin"),
  validate(manualWalletCreditSchema),
  walletController.manualCreditWallet,
);

customerWalletRouter.post(
  "/debit",
  requireBusinessRole("owner", "admin"),
  validate(manualWalletDebitSchema),
  walletController.manualDebitWallet,
);

export const businessWalletsRouter = Router({ mergeParams: true });

businessWalletsRouter.get(
  "/",
  validateQuery(listBusinessWalletsQuerySchema),
  walletController.listBusinessWallets,
);
