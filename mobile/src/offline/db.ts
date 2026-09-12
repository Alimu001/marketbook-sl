import * as SQLite from "expo-sqlite";
import { CURRENT_SCHEMA_VERSION, MIGRATIONS } from "./migrations";
import { OFFLINE_ERROR_CODES } from "./types";

const DATABASE_NAME = "marketbook_offline.db";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * The schema_version table must exist before we try to read from it.
 * This is especially important on a fresh installation where the
 * SQLite database exists but no migrations have run yet.
 */
async function ensureSchemaVersionTable(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );
  `);
}

async function readSchemaVersion(
  db: SQLite.SQLiteDatabase,
): Promise<number> {
  // Make sure the table exists before querying it.
  await ensureSchemaVersionTable(db);

  const row = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM schema_version LIMIT 1;",
  );

  return row?.version ?? 0;
}

async function runMigrations(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const currentVersion = await readSchemaVersion(db);

  for (
    let version = currentVersion + 1;
    version <= CURRENT_SCHEMA_VERSION;
    version += 1
  ) {
    const statements = MIGRATIONS[version];

    if (!statements) {
      throw new Error(`Missing offline migration for version ${version}`);
    }

    await db.withTransactionAsync(async () => {
      for (const statement of statements) {
        await db.execAsync(statement);
      }

      await db.runAsync("DELETE FROM schema_version;");
      await db.runAsync(
        "INSERT INTO schema_version(version) VALUES (?);",
        [version],
      );
    });
  }
}

export async function getOfflineDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
        await runMigrations(db);
        return db;
      } catch (error) {
        databasePromise = null;
        throw error;
      }
    })();
  }

  return databasePromise;
}

export async function initializeOfflineDatabase(): Promise<void> {
  await getOfflineDatabase();
}

export function getOfflineDbErrorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    error.message.includes(OFFLINE_ERROR_CODES.LOCAL_DB_ERROR)
  ) {
    return "Local offline storage is unavailable.";
  }

  return "Local offline storage failed to initialize.";
}