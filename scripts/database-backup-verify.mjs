import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { postgresToolEnvironment } from "./postgres-tools.mjs";

const suppliedPath = process.argv[2];
if (!suppliedPath) {
  throw new Error("Provide a backup path: npm run db:backup:verify -- <file.dump>");
}

const backupPath = resolve(suppliedPath);
if (!existsSync(backupPath) || !statSync(backupPath).isFile()) {
  throw new Error(`Backup file not found: ${backupPath}`);
}

const verification = spawnSync("pg_restore", ["--list", backupPath], {
  env: postgresToolEnvironment(),
  stdio: "ignore",
});
if (verification.error?.code === "ENOENT") {
  throw new Error("pg_restore is required. Install PostgreSQL client tools first.");
}
if (verification.status !== 0) {
  throw new Error(`Backup verification failed: ${backupPath}`);
}

console.log(`Backup structure verified: ${backupPath}`);
