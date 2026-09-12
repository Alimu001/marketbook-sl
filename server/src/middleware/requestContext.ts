import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

const SAFE_REQUEST_ID = /^[a-zA-Z0-9_-]{8,64}$/;

export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const supplied = req.header("x-request-id")?.trim();
  const requestId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
  const startedAt = performance.now();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  if (env.REQUEST_LOGGING_ENABLED) {
    res.on("finish", () => {
      console.log(JSON.stringify({
        event: "http_request",
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }));
    });
  }

  next();
}
