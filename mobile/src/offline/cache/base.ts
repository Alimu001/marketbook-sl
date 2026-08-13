import { getOfflineDatabase } from "../db";
import type { CacheEntityType, CacheRecord } from "../types";

interface CacheRow {
  user_id: string;
  business_id: string;
  entity_type: CacheEntityType;
  server_id: string | null;
  local_id: string | null;
  data_json: string;
  updated_at: string;
  synced_at: string | null;
  pending_sync: number;
}

function rowToCacheRecord<T>(row: CacheRow): CacheRecord<T> {
  return {
    userId: row.user_id,
    businessId: row.business_id,
    entityType: row.entity_type,
    serverId: row.server_id,
    localId: row.local_id,
    data: JSON.parse(row.data_json) as T,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at,
    pendingSync: row.pending_sync === 1,
  };
}

export async function upsertCacheRecord<T>(input: {
  userId: string;
  businessId: string;
  entityType: CacheEntityType;
  serverId?: string | null;
  localId?: string | null;
  data: T;
  pendingSync?: boolean;
  syncedAt?: string | null;
}): Promise<void> {
  const db = await getOfflineDatabase();
  const now = new Date().toISOString();
  const serverId = input.serverId ?? null;
  const localId = input.localId ?? null;

  if (serverId) {
    await db.runAsync(
      `DELETE FROM cache_records
       WHERE user_id = ? AND business_id = ? AND entity_type = ?
         AND local_id IS NOT NULL AND server_id IS NULL
         AND json_extract(data_json, '$.id') = ?;`,
      [input.userId, input.businessId, input.entityType, serverId],
    );
  }

  const existing = serverId
    ? await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM cache_records
         WHERE user_id = ? AND business_id = ? AND entity_type = ? AND server_id = ?;`,
        [input.userId, input.businessId, input.entityType, serverId],
      )
    : localId
      ? await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM cache_records
           WHERE user_id = ? AND business_id = ? AND entity_type = ? AND local_id = ?;`,
          [input.userId, input.businessId, input.entityType, localId],
        )
      : null;

  if (existing) {
    await db.runAsync(
      `UPDATE cache_records
       SET data_json = ?, updated_at = ?, synced_at = ?, pending_sync = ?,
           server_id = COALESCE(?, server_id), local_id = ?
       WHERE id = ?;`,
      [
        JSON.stringify(input.data),
        now,
        input.syncedAt ?? now,
        input.pendingSync ? 1 : 0,
        serverId,
        localId,
        existing.id,
      ],
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO cache_records (
      user_id, business_id, entity_type, server_id, local_id,
      data_json, updated_at, synced_at, pending_sync
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      input.userId,
      input.businessId,
      input.entityType,
      serverId,
      localId,
      JSON.stringify(input.data),
      now,
      input.syncedAt ?? now,
      input.pendingSync ? 1 : 0,
    ],
  );
}

export async function listCacheRecords<T>(
  userId: string,
  businessId: string,
  entityType: CacheEntityType,
): Promise<CacheRecord<T>[]> {
  const db = await getOfflineDatabase();
  const rows = await db.getAllAsync<CacheRow>(
    `SELECT * FROM cache_records
     WHERE user_id = ? AND business_id = ? AND entity_type = ?
     ORDER BY updated_at DESC;`,
    [userId, businessId, entityType],
  );

  return rows.map(rowToCacheRecord<T>);
}

export async function removeCacheRecordByLocalId(
  userId: string,
  businessId: string,
  entityType: CacheEntityType,
  localId: string,
): Promise<void> {
  const db = await getOfflineDatabase();
  await db.runAsync(
    `DELETE FROM cache_records
     WHERE user_id = ? AND business_id = ? AND entity_type = ? AND local_id = ?;`,
    [userId, businessId, entityType, localId],
  );
}

export async function pruneCacheHistory(
  userId: string,
  businessId: string,
  entityType: CacheEntityType,
  keep: number,
): Promise<void> {
  const db = await getOfflineDatabase();
  await db.runAsync(
    `DELETE FROM cache_records
     WHERE id IN (
       SELECT id FROM cache_records
       WHERE user_id = ? AND business_id = ? AND entity_type = ?
         AND pending_sync = 0 AND server_id IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT -1 OFFSET ?
     );`,
    [userId, businessId, entityType, keep],
  );
}

export async function setSyncMetadata(
  userId: string,
  businessId: string,
  key: string,
  value: string,
): Promise<void> {
  const db = await getOfflineDatabase();
  await db.runAsync(
    `INSERT INTO sync_metadata(user_id, business_id, meta_key, meta_value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, business_id, meta_key)
     DO UPDATE SET meta_value = excluded.meta_value;`,
    [userId, businessId, key, value],
  );
}

export async function getSyncMetadata(
  userId: string,
  businessId: string,
  key: string,
): Promise<string | null> {
  const db = await getOfflineDatabase();
  const row = await db.getFirstAsync<{ meta_value: string }>(
    `SELECT meta_value FROM sync_metadata
     WHERE user_id = ? AND business_id = ? AND meta_key = ?;`,
    [userId, businessId, key],
  );
  return row?.meta_value ?? null;
}

export async function clearCacheForOtherUsers(activeUserId: string): Promise<void> {
  const db = await getOfflineDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM cache_records WHERE user_id != ?;", [
      activeUserId,
    ]);
    await db.runAsync("DELETE FROM sync_metadata WHERE user_id != ?;", [
      activeUserId,
    ]);
  });
}

export async function saveLocalIdMapping(input: {
  localId: string;
  serverId: string;
  entityType: CacheEntityType;
  userId: string;
  businessId: string;
}): Promise<void> {
  const db = await getOfflineDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO local_id_mappings(
      local_id, server_id, entity_type, user_id, business_id
    ) VALUES (?, ?, ?, ?, ?);`,
    [
      input.localId,
      input.serverId,
      input.entityType,
      input.userId,
      input.businessId,
    ],
  );
}

export async function resolveLocalId(
  localId: string,
): Promise<string | null> {
  const db = await getOfflineDatabase();
  const row = await db.getFirstAsync<{ server_id: string }>(
    "SELECT server_id FROM local_id_mappings WHERE local_id = ?;",
    [localId],
  );
  return row?.server_id ?? null;
}
