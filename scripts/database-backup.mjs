import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { postgresToolEnvironment } from "./postgres-tools.mjs";

try {
  process.loadEnvFile(resolve("server/.env"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function commandAvailable(command, args) {
  const result = spawnSync(command, args, {
    env: postgresToolEnvironment(),
    stdio: "ignore",
  });
  return result.status === 0;
}

function postgresEnvironment(databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
  }

  const environment = {
    ...postgresToolEnvironment(),
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) environment.PGSSLMODE = sslMode;
  return environment;
}

if (!commandAvailable("pg_dump", ["--version"])) {
  throw new Error("pg_dump is required. Install PostgreSQL client tools first.");
}
if (!commandAvailable("pg_restore", ["--version"])) {
  throw new Error("pg_restore is required. Install PostgreSQL client tools first.");
}

if (process.argv.includes("--check")) {
  console.log("PostgreSQL backup tools are available.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in the environment or server/.env.");
}

const backupDirectory = resolve(process.env.BACKUP_DIRECTORY || "backups");
mkdirSync(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
const backupPath = resolve(backupDirectory, `marketbook-${timestamp}.dump`);

const backup = spawnSync(
  "pg_dump",
  ["--format=custom", "--no-owner", "--no-privileges", "--file", backupPath],
  {
    env: postgresEnvironment(process.env.DATABASE_URL),
    stdio: ["ignore", "inherit", "inherit"],
  },
);
if (backup.status !== 0) {
  throw new Error("Database backup failed. No successful backup was produced.");
}

const verification = spawnSync("pg_restore", ["--list", backupPath], {
  env: postgresToolEnvironment(),
  stdio: "ignore",
});
if (verification.status !== 0) {
  throw new Error(`Backup was created but verification failed: ${backupPath}`);
}

console.log(`Verified database backup created: ${backupPath}`);
