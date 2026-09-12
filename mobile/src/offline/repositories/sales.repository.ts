import { businessScopedPath } from "@/api/businesses";
import { createSale as apiCreateSale } from "@/api/sales";
import { ApiError } from "@/api/errors";
import type { CreateSalePayload, SaleDetail, SaleListItem } from "@/sales/types";
import { getOfflineDatabase } from "../db";
import { createIdempotencyKey, createLocalId } from "../localIds";
import { isOnlineStatus } from "../network";
import type { NetworkStatus, SyncScope } from "../types";

export interface SaleDisplaySnapshot {
  totalAmount: string;
  amountPaid: string;
  walletAmountUsed: string;
  outstandingAmount: string;
  paymentStatus: SaleListItem["paymentStatus"];
  customer: SaleListItem["customer"];
  createdBy: SaleListItem["createdBy"];
  itemCount: number;
}

export async function createSale(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  input: CreateSalePayload,
  snapshot: SaleDisplaySnapshot,
): Promise<{ sale: SaleDetail | SaleListItem; pendingSync: boolean }> {
  const idempotencyKey = createIdempotencyKey("create-sale");

  if (isOnlineStatus(networkStatus)) {
    try {
      const result = await apiCreateSale(
        scope.accessToken,
        scope.businessId,
        input,
        idempotencyKey,
      );
      return { sale: result.sale, pendingSync: false };
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 0)) throw error;
    }
  }

  const localId = createLocalId("sale");
  const queueId = createLocalId("queue");
  const now = new Date().toISOString();
  const pendingSale: SaleListItem = {
    id: localId,
    receiptNumber: "Pending sync",
    totalAmount: snapshot.totalAmount,
    amountPaid: snapshot.amountPaid,
    walletAmountUsed: snapshot.walletAmountUsed,
    outstandingAmount: snapshot.outstandingAmount,
    refundedAmount: "0.00",
    paymentStatus: snapshot.paymentStatus,
    paymentMethod: input.paymentMethod ?? null,
    paymentSource: "MANUAL",
    paymentProvider: null,
    providerReference: null,
    status: "COMPLETED",
    customer: snapshot.customer,
    createdBy: snapshot.createdBy,
    itemCount: snapshot.itemCount,
    createdAt: now,
  };

  const db = await getOfflineDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cache_records (
        user_id, business_id, entity_type, server_id, local_id,
        data_json, updated_at, synced_at, pending_sync
      ) VALUES (?, ?, 'sale', NULL, ?, ?, ?, NULL, 1);`,
      [scope.userId, scope.businessId, localId, JSON.stringify(pendingSale), now],
    );
    await db.runAsync(
      `INSERT INTO sync_queue (
        local_id, user_id, business_id, operation_type, entity_type,
        entity_local_id, endpoint, method, payload_json, idempotency_key,
        status, attempt_count, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, 'CREATE_SALE', 'sale', ?, ?, 'POST', ?, ?, 'PENDING', 0, NULL, ?, ?);`,
      [
        queueId,
        scope.userId,
        scope.businessId,
        localId,
        `${businessScopedPath(scope.businessId)}/sales`,
        JSON.stringify(input),
        idempotencyKey,
        now,
        now,
      ],
    );
  });

  return { sale: pendingSale, pendingSync: true };
}
