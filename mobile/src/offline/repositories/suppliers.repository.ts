import {
  createSupplier as apiCreateSupplier,
  listSuppliers as apiListSuppliers,
} from "@/api/suppliers";
import { businessScopedPath } from "@/api/businesses";
import type { PaginatedResponse } from "@/api/errors";
import type {
  CreateSupplierPayload,
  ListSuppliersParams,
  SupplierDetail,
  SupplierSummary,
} from "@/suppliers/types";
import {
  listCacheRecords,
  pruneCacheHistory,
  upsertCacheRecord,
} from "../cache/base";
import { createIdempotencyKey, createLocalId } from "../localIds";
import { enqueueSyncOperation } from "../syncQueue";
import { mergePendingIntoList } from "../syncEngine";
import { isOnlineStatus } from "../network";
import type { NetworkStatus, SyncScope } from "../types";
import { CACHE_HISTORY_LIMIT } from "../types";

function suppliersPath(businessId: string): string {
  return `${businessScopedPath(businessId)}/suppliers`;
}

export async function listSuppliers(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: ListSuppliersParams = {},
): Promise<PaginatedResponse<SupplierSummary[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await apiListSuppliers(
      scope.accessToken,
      scope.businessId,
      params,
    );

    for (const supplier of response.items) {
      await upsertCacheRecord({
        userId: scope.userId,
        businessId: scope.businessId,
        entityType: "supplier",
        serverId: supplier.id,
        data: supplier,
      });
    }

    await pruneCacheHistory(
      scope.userId,
      scope.businessId,
      "supplier",
      CACHE_HISTORY_LIMIT,
    );

    const merged = await mergePendingIntoList(
      scope.userId,
      scope.businessId,
      "supplier",
      response.items,
    );

    return {
      ...response,
      items: merged,
      total: merged.length,
    };
  }

  const cached = await listCacheRecords<SupplierSummary>(
    scope.userId,
    scope.businessId,
    "supplier",
  );

  let items = cached.map((record) => record.data);

  if (params.isActive !== undefined) {
    items = items.filter((supplier) => supplier.isActive === params.isActive);
  }

  if (params.search) {
    const query = params.search.toLowerCase();
    items = items.filter(
      (supplier) =>
        supplier.name.toLowerCase().includes(query) ||
        supplier.phone?.toLowerCase().includes(query) ||
        supplier.email?.toLowerCase().includes(query),
    );
  }

  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const start = (page - 1) * limit;

  return {
    items: items.slice(start, start + limit),
    page,
    limit,
    total: items.length,
  };
}

export async function createSupplier(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  input: CreateSupplierPayload,
): Promise<SupplierDetail> {
  if (isOnlineStatus(networkStatus)) {
    const supplier = await apiCreateSupplier(
      scope.accessToken,
      scope.businessId,
      input,
      createIdempotencyKey("create-supplier"),
    );

    await upsertCacheRecord({
      userId: scope.userId,
      businessId: scope.businessId,
      entityType: "supplier",
      serverId: supplier.id,
      data: {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        isActive: supplier.isActive,
        outstandingBalance: supplier.outstandingBalance,
        openPayableCount: supplier.openPayableCount,
        createdAt: supplier.createdAt,
      },
    });

    return supplier;
  }

  const localId = createLocalId("supplier");
  const now = new Date().toISOString();

  const pendingDetail: SupplierDetail = {
    id: localId,
    businessId: scope.businessId,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    isActive: true,
    outstandingBalance: "0.0000",
    openPayableCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await upsertCacheRecord({
    userId: scope.userId,
    businessId: scope.businessId,
    entityType: "supplier",
    localId,
    data: {
      id: localId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      isActive: true,
      outstandingBalance: "0.0000",
      openPayableCount: 0,
      createdAt: now,
    },
    pendingSync: true,
    syncedAt: null,
  });

  await enqueueSyncOperation({
    localId: createLocalId("queue"),
    userId: scope.userId,
    businessId: scope.businessId,
    operationType: "CREATE_SUPPLIER",
    entityType: "supplier",
    entityLocalId: localId,
    endpoint: suppliersPath(scope.businessId),
    method: "POST",
    payload: input as unknown as Record<string, unknown>,
    idempotencyKey: createIdempotencyKey("create-supplier"),
  });

  return pendingDetail;
}
