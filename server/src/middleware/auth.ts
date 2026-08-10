import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { AppError } from "./errorHandler.js";

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const token = header.slice("Bearer ".length).trim();

    if (!token) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub };
    next();
  } catch (error) {
    next(error);
  }
}
