import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ZodError } from "zod";
import { AppError } from "./errorHandler.js";

function handleValidationError(error: unknown, next: NextFunction): void {
  if (error instanceof ZodError) {
    next(
      new AppError(400, "Validation failed", "VALIDATION_ERROR", {
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
    );
    return;
  }

  next(error);
}

export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      handleValidationError(error, next);
    }
  };
}

export function validateQuery(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.validatedQuery = schema.parse(req.query);
      next();
    } catch (error) {
      handleValidationError(error, next);
    }
  };
}
