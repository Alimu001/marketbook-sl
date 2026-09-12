import { getOfflineDatabase } from "./db";
import type {
  CacheEntityType,
  SyncOperationType,
  SyncQueueItem,
  SyncQueueStatus,
} from "./types";

interface SyncQueueRow {
  local_id: string;
  user_id: string;
  business_id: string;
  operation_type: SyncOperationType;
  entity_type: CacheEntityType;
  entity_local_id: string;
  endpoint: string;
  method: "POST";
  payload_json: string;
  idempotency_key: string;
  status: SyncQueueStatus;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToQueueItem(row: SyncQueueRow): SyncQueueItem {
  return {
    localId: row.local_id,
    userId: row.user_id,
    businessId: row.business_id,
    operationType: row.operation_type,
    entityType: row.entity_type,
    entityLocalId: row.entity_local_id,
    endpoint: row.endpoint,
    method: row.method,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function enqueueSyncOperation(
  item: Omit<
    SyncQueueItem,
    "status" | "attemptCount" | "lastError" | "createdAt" | "updatedAt"
  >,
): Promise<void> {
  const db = await getOfflineDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO sync_queue (
      local_id, user_id, business_id, operation_type, entity_type,
      entity_local_id, endpoint, method, payload_json, idempotency_key,
      status, attempt_count, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, NULL, ?, ?);`,
    [
      item.localId,
      item.userId,
      item.businessId,
      item.operationType,
      item.entityType,
      item.entityLocalId,
      item.endpoint,
      item.method,
      JSON.stringify(item.payload),
      item.idempotencyKey,
      now,
      now,
    ],
  );
}

export async function listSyncQueueItems(
  userId: string,
  businessId: string,
  status?: SyncQueueStatus,
): Promise<SyncQueueItem[]> {
  const db = await getOfflineDatabase();
  const rows = status
    ? await db.getAllAsync<SyncQueueRow>(
        `SELECT * FROM sync_queue
         WHERE user_id = ? AND business_id = ? AND status = ?
         ORDER BY created_at ASC;`,
        [userId, businessId, status],
      )
    : await db.getAllAsync<SyncQueueRow>(
        `SELECT * FROM sync_queue
         WHERE user_id = ? AND business_id = ?
         ORDER BY created_at ASC;`,
        [userId, businessId],
      );

  return rows.map(rowToQueueItem);
}

export async function listPendingSyncQueueItems(
  userId: string,
  businessId: string,
): Promise<SyncQueueItem[]> {
  return listSyncQueueItems(userId, businessId, "PENDING");
}

export async function updateSyncQueueItem(
  localId: string,
  patch: Partial<
    Pick<SyncQueueItem, "status" | "attemptCount" | "lastError">
  >,
): Promise<void> {
  const db = await getOfflineDatabase();
  const now = new Date().toISOString();
  const fields: string[] = ["updated_at = ?"];
  const values: Array<string | number | null> = [now];

  if (patch.status !== undefined) {
    fields.push("status = ?");
    values.push(patch.status);
  }

  if (patch.attemptCount !== undefined) {
    fields.push("attempt_count = ?");
    values.push(patch.attemptCount);
  }

  if (patch.lastError !== undefined) {
    fields.push("last_error = ?");
    values.push(patch.lastError);
  }

  values.push(localId);

  await db.runAsync(
    `UPDATE sync_queue SET ${fields.join(", ")} WHERE local_id = ?;`,
    values,
  );
}

export async function deleteSyncQueueItem(localId: string): Promise<void> {
  const db = await getOfflineDatabase();
  await db.runAsync("DELETE FROM sync_queue WHERE local_id = ?;", [localId]);
}

export async function countSyncQueueByStatus(
  userId: string,
  businessId: string,
): Promise<Record<SyncQueueStatus, number>> {
  const db = await getOfflineDatabase();
  const rows = await db.getAllAsync<{ status: SyncQueueStatus; count: number }>(
    `SELECT status, COUNT(*) as count FROM sync_queue
     WHERE user_id = ? AND business_id = ?
     GROUP BY status;`,
    [userId, businessId],
  );

  const counts: Record<SyncQueueStatus, number> = {
    PENDING: 0,
    SYNCING: 0,
    SYNCED: 0,
    FAILED: 0,
    CONFLICT: 0,
  };

  for (const row of rows) {
    counts[row.status] = row.count;
  }

  return counts;
}

export async function retainQueueForUser(userId: string): Promise<void> {
  const db = await getOfflineDatabase();
  await db.runAsync("DELETE FROM sync_queue WHERE user_id != ?;", [userId]);
}
