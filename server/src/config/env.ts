import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return port;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

if (!["development", "test", "production"].includes(nodeEnv)) {
  throw new Error(`Invalid NODE_ENV value: ${nodeEnv}`);
}

export const env = {
  NODE_ENV: nodeEnv as "development" | "test" | "production",
  PORT: parsePort(process.env.PORT ?? "3000"),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  JWT_ACCESS_SECRET: requireEnv("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: requireEnv("JWT_REFRESH_SECRET"),
  JWT_ACCESS_EXPIRES_IN: requireEnv("JWT_ACCESS_EXPIRES_IN"),
  JWT_REFRESH_EXPIRES_IN: requireEnv("JWT_REFRESH_EXPIRES_IN"),
  CORS_ORIGIN: requireEnv("CORS_ORIGIN"),
} as const;
