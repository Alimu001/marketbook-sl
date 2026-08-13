import { apiRequest } from "@/api/client";
import { ApiError } from "@/api/errors";
import type { CustomerDetail } from "@/customers/types";
import type { ExpenseDetail } from "@/expenses/types";
import type { SupplierDetail } from "@/suppliers/types";
import {
  listCacheRecords,
  pruneCacheHistory,
  removeCacheRecordByLocalId,
  saveLocalIdMapping,
  setSyncMetadata,
  upsertCacheRecord,
} from "./cache/base";
import { createIdempotencyKey } from "./localIds";
import {
  deleteSyncQueueItem,
  listPendingSyncQueueItems,
  listSyncQueueItems,
  updateSyncQueueItem,
} from "./syncQueue";
import type {
  CacheEntityType,
  SyncErrorClassification,
  SyncQueueItem,
  SyncScope,
} from "./types";
import { CACHE_HISTORY_LIMIT } from "./types";

const MAX_RETRY_ATTEMPTS = 5;

function classifySyncError(error: unknown): SyncErrorClassification {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "NON_RETRYABLE";
    }

    if (error.status === 409 && error.code === "IDEMPOTENCY_CONFLICT") {
      return "CONFLICT";
    }

    if (
      error.status === 409 ||
      error.status === 400 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status === 422
    ) {
      return "NON_RETRYABLE";
    }

    if (error.status >= 500 || error.status === 0) {
      return "RETRYABLE";
    }
  }

  return "RETRYABLE";
}

function getRetryDelayMs(attemptCount: number): number {
  return Math.min(60_000, 2_000 * 2 ** attemptCount);
}

async function refreshEntityCache(
  scope: SyncScope,
  entityType: CacheEntityType,
  entity: unknown,
  serverId: string,
): Promise<void> {
  await upsertCacheRecord({
    userId: scope.userId,
    businessId: scope.businessId,
    entityType,
    serverId,
    localId: null,
    data: entity,
    pendingSync: false,
  });
  await pruneCacheHistory(
    scope.userId,
    scope.businessId,
    entityType,
    CACHE_HISTORY_LIMIT,
  );
}

async function processQueueItem(
  scope: SyncScope,
  item: SyncQueueItem,
): Promise<void> {
  await updateSyncQueueItem(item.localId, {
    status: "SYNCING",
    attemptCount: item.attemptCount + 1,
    lastError: null,
  });

  try {
    let result: CustomerDetail | SupplierDetail | ExpenseDetail;

    if (item.operationType === "CREATE_CUSTOMER") {
      result = await apiRequest<CustomerDetail>(item.endpoint, {
        method: "POST",
        accessToken: scope.accessToken,
        body: item.payload,
        headers: {
          "Idempotency-Key": item.idempotencyKey,
        },
      });
      await saveLocalIdMapping({
        localId: item.entityLocalId,
        serverId: result.id,
        entityType: "customer",
        userId: scope.userId,
        businessId: scope.businessId,
      });
      await removeCacheRecordByLocalId(
        scope.userId,
        scope.businessId,
        "customer",
        item.entityLocalId,
      );
      await refreshEntityCache(scope, "customer", result, result.id);
    } else if (item.operationType === "CREATE_SUPPLIER") {
      result = await apiRequest<SupplierDetail>(item.endpoint, {
        method: "POST",
        accessToken: scope.accessToken,
        body: item.payload,
        headers: {
          "Idempotency-Key": item.idempotencyKey,
        },
      });
      await saveLocalIdMapping({
        localId: item.entityLocalId,
        serverId: result.id,
        entityType: "supplier",
        userId: scope.userId,
        businessId: scope.businessId,
      });
      await removeCacheRecordByLocalId(
        scope.userId,
        scope.businessId,
        "supplier",
        item.entityLocalId,
      );
      await refreshEntityCache(scope, "supplier", result, result.id);
    } else {
      result = await apiRequest<ExpenseDetail>(item.endpoint, {
        method: "POST",
        accessToken: scope.accessToken,
        body: item.payload,
        headers: {
          "Idempotency-Key": item.idempotencyKey,
        },
      });
      await saveLocalIdMapping({
        localId: item.entityLocalId,
        serverId: result.id,
        entityType: "expense",
        userId: scope.userId,
        businessId: scope.businessId,
      });
      await removeCacheRecordByLocalId(
        scope.userId,
        scope.businessId,
        "expense",
        item.entityLocalId,
      );
      await refreshEntityCache(scope, "expense", result, result.id);
    }

    await updateSyncQueueItem(item.localId, {
      status: "SYNCED",
      lastError: null,
    });
  } catch (error) {
    const classification = classifySyncError(error);
    const message =
      error instanceof ApiError
        ? error.message
        : "Sync failed. Please try again.";

    if (classification === "CONFLICT") {
      await updateSyncQueueItem(item.localId, {
        status: "CONFLICT",
        lastError: message,
      });
      return;
    }

    if (classification === "NON_RETRYABLE") {
      await updateSyncQueueItem(item.localId, {
        status: "FAILED",
        lastError: message,
      });
      return;
    }

    const nextAttempt = item.attemptCount + 1;

    if (nextAttempt >= MAX_RETRY_ATTEMPTS) {
      await updateSyncQueueItem(item.localId, {
        status: "FAILED",
        lastError: message,
      });
      return;
    }

    await updateSyncQueueItem(item.localId, {
      status: "PENDING",
      lastError: message,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, getRetryDelayMs(nextAttempt));
    });
  }
}

export interface SyncEngineResult {
  syncedCount: number;
  failedCount: number;
  conflictCount: number;
  authRequired: boolean;
}

export async function runSyncEngine(scope: SyncScope): Promise<SyncEngineResult> {
  const result: SyncEngineResult = {
    syncedCount: 0,
    failedCount: 0,
    conflictCount: 0,
    authRequired: false,
  };

  const pending = await listPendingSyncQueueItems(
    scope.userId,
    scope.businessId,
  );

  for (const item of pending) {
    if (item.attemptCount > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, getRetryDelayMs(item.attemptCount));
      });
    }

    await processQueueItem(scope, item);

    const updated = await listPendingSyncQueueItems(
      scope.userId,
      scope.businessId,
    );

    if (updated.some((entry) => entry.localId === item.localId)) {
      continue;
    }

    const processed = (
      await listSyncQueueItems(scope.userId, scope.businessId)
    ).find((entry) => entry.localId === item.localId);

    if (!processed) {
      continue;
    }

    if (processed.status === "SYNCED") {
      result.syncedCount += 1;
    } else if (processed.status === "CONFLICT") {
      result.conflictCount += 1;
    } else if (processed.status === "FAILED") {
      result.failedCount += 1;
      if (processed.lastError?.includes("session")) {
        result.authRequired = true;
      }
    }
  }

  await setSyncMetadata(
    scope.userId,
    scope.businessId,
    "last_sync_at",
    new Date().toISOString(),
  );

  return result;
}

export async function retrySyncQueueItem(
  scope: SyncScope,
  localId: string,
): Promise<void> {
  await updateSyncQueueItem(localId, {
    status: "PENDING",
    lastError: null,
  });
  await runSyncEngine(scope);
}

export async function discardSyncQueueItem(input: {
  scope: SyncScope;
  localId: string;
  entityType: CacheEntityType;
  entityLocalId: string;
}): Promise<void> {
  await removeCacheRecordByLocalId(
    input.scope.userId,
    input.scope.businessId,
    input.entityType,
    input.entityLocalId,
  );
  await deleteSyncQueueItem(input.localId);
}

export function buildQueueItemIdempotencyKey(
  operationType: SyncQueueItem["operationType"],
): string {
  return createIdempotencyKey(operationType.toLowerCase());
}

export async function mergePendingIntoList<T extends { id: string }>(
  userId: string,
  businessId: string,
  entityType: CacheEntityType,
  serverItems: T[],
): Promise<T[]> {
  const cached = await listCacheRecords<T>(
    userId,
    businessId,
    entityType,
  );
  const pendingLocal = cached
    .filter((record) => record.pendingSync && record.localId)
    .map((record) => record.data);

  const merged = [...pendingLocal];

  for (const item of serverItems) {
    if (!merged.some((entry) => entry.id === item.id)) {
      merged.push(item);
    }
  }

  return merged;
}
