import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`${env.NODE_ENV} server listening on http://localhost:${env.PORT}`);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; shutting down`);

  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    try {
      await prisma.$disconnect();
    } finally {
      clearTimeout(forceExit);
      process.exit(error ? 1 : 0);
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
