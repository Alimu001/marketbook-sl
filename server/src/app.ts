import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { APP_NAME } from "./config/constants.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { v1Router } from "./routes/v1/index.js";

export function createApp() {
  const app = express();

  if (env.TRUST_PROXY_HOPS > 0) {
    app.set("trust proxy", env.TRUST_PROXY_HOPS);
  }

  app.disable("x-powered-by");
  app.use(helmet());

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
      environment: env.NODE_ENV,
    });
  });

  app.use("/api/v1", v1Router);

  app.use(errorHandler);

  return app;
}
