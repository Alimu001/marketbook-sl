import { Router } from "express";
import { authRouter } from "../../modules/auth/auth.routes.js";
import { businessesRouter } from "../../modules/businesses/business.routes.js";
import { orangeMoneyCallbackRouter } from "../../modules/payments/payment.routes.js";

export const v1Router = Router();

v1Router.use("/auth", authRouter);
v1Router.use("/businesses", businessesRouter);
v1Router.use("/payments/providers/orange-money", orangeMoneyCallbackRouter);
