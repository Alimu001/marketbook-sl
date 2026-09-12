import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { APP_NAME } from "./config/constants.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestContext } from "./middleware/requestContext.js";
import { checkDatabaseReadiness } from "./lib/readiness.js";
import { v1Router } from "./routes/v1/index.js";

interface AppOptions {
  readinessCheck?: () => Promise<void>;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const readinessCheck = options.readinessCheck ?? checkDatabaseReadiness;

  if (env.TRUST_PROXY_HOPS > 0) {
    app.set("trust proxy", env.TRUST_PROXY_HOPS);
  }

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(requestContext);

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
    }),
  );
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      message: `${APP_NAME} API is running`,
    });
  });

  app.get("/ready", async (_req, res) => {
    try {
      await readinessCheck();
      res.json({ status: "ready", message: `${APP_NAME} API is ready` });
    } catch {
      res.status(503).json({
        status: "unavailable",
        message: `${APP_NAME} API is not ready`,
      });
    }
  });

  app.use("/api/v1", v1Router);

  app.use(errorHandler);

  return app;
}
