import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function recordBusinessActivity(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const businessId = req.business?.id;
  const actorUserId = req.auth?.userId;

  if (!businessId || !actorUserId || !MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode < 200 || res.statusCode >= 400) {
      return originalJson(body);
    }
    const path = req.originalUrl.split("?", 1)[0] ?? req.originalUrl;
    void prisma.businessActivity
      .create({
        data: {
          businessId,
          actorUserId,
          method: req.method,
          path,
          statusCode: res.statusCode,
        },
      })
      .catch((error: unknown) => {
        console.error("Unable to record business activity", error);
      })
      .finally(() => {
        originalJson(body);
      });
    return res;
  }) as Response["json"];

  next();
}
