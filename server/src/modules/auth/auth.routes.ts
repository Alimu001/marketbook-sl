import { Router } from "express";
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "@marketbook/shared/validation";
import { authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as authController from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), authController.register);
authRouter.post("/login", validate(loginSchema), authController.login);
authRouter.post("/refresh", validate(refreshSchema), authController.refresh);
authRouter.post("/logout", validate(logoutSchema), authController.logout);
authRouter.get("/me", authenticate, authController.me);
