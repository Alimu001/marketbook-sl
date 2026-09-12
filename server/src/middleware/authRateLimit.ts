import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

interface AuthRateLimiterOptions {
  windowMs?: number;
  limit?: number;
  skip?: boolean;
}

export function createAuthRateLimiter(options: AuthRateLimiterOptions = {}) {
  return rateLimit({
    windowMs: options.windowMs ?? env.AUTH_RATE_LIMIT_WINDOW_MS,
    limit: options.limit ?? env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => options.skip ?? env.NODE_ENV === "test",
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "AUTH_RATE_LIMITED",
          message: "Too many authentication attempts. Please try again later.",
        },
      });
    },
  });
}

export const authRateLimiter = createAuthRateLimiter();
