export type NetworkStatus = "ONLINE" | "OFFLINE" | "UNKNOWN";

export type SyncQueueStatus =
  | "PENDING"
  | "SYNCING"
  | "SYNCED"
  | "FAILED"
  | "CONFLICT";

export type SyncOperationType =
  | "CREATE_EXPENSE"
  | "CREATE_CUSTOMER"
  | "CREATE_SUPPLIER";

export type CacheEntityType =
  | "business"
  | "product"
  | "inventory"
  | "customer"
  | "supplier"
  | "sale"
  | "purchase"
  | "expense"
  | "expense_category"
  | "debt"
  | "payable"
  | "payment";

export type SyncErrorClassification = "RETRYABLE" | "NON_RETRYABLE" | "CONFLICT";

export interface SyncQueueItem {
  localId: string;
  userId: string;
  businessId: string;
  operationType: SyncOperationType;
  entityType: CacheEntityType;
  entityLocalId: string;
  endpoint: string;
  method: "POST";
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: SyncQueueStatus;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CacheRecord<T = unknown> {
  userId: string;
  businessId: string;
  entityType: CacheEntityType;
  serverId: string | null;
  localId: string | null;
  data: T;
  updatedAt: string;
  syncedAt: string | null;
  pendingSync: boolean;
}

export interface SyncScope {
  userId: string;
  businessId: string;
  accessToken: string;
}

export type SyncBannerState =
  | "hidden"
  | "offline"
  | "syncing"
  | "synced"
  | "sync_errors";

export const CACHE_HISTORY_LIMIT = 100;

export const OFFLINE_ERROR_CODES = {
  OFFLINE: "OFFLINE",
  SYNC_FAILED: "SYNC_FAILED",
  SYNC_CONFLICT: "SYNC_CONFLICT",
  SYNC_AUTH_REQUIRED: "SYNC_AUTH_REQUIRED",
  SYNC_RETRYING: "SYNC_RETRYING",
  LOCAL_DB_ERROR: "LOCAL_DB_ERROR",
} as const;
