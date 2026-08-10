import { Router } from "express";
import { authRouter } from "../../modules/auth/auth.routes.js";
import { businessesRouter } from "../../modules/businesses/business.routes.js";

export const v1Router = Router();

v1Router.use("/auth", authRouter);
v1Router.use("/businesses", businessesRouter);
