import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { APP_NAME } from "./config/constants.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { v1Router } from "./routes/v1/index.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
    }),
  );
  app.use(express.json());

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
