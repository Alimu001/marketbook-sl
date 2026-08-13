import { listCustomers as apiListCustomers, createCustomer as apiCreateCustomer } from "@/api/customers";
import { businessScopedPath } from "@/api/businesses";
import type { CreateCustomerPayload, CustomerDetail, CustomerSummary, ListCustomersParams } from "@/customers/types";
import type { PaginatedResponse } from "@/api/errors";
import {
  listCacheRecords,
  pruneCacheHistory,
  upsertCacheRecord,
} from "../cache/base";
import { createLocalId, createIdempotencyKey } from "../localIds";
import { enqueueSyncOperation } from "../syncQueue";
import { mergePendingIntoList } from "../syncEngine";
import { isOnlineStatus } from "../network";
import type { NetworkStatus, SyncScope } from "../types";
import { CACHE_HISTORY_LIMIT } from "../types";

function customersPath(businessId: string): string {
  return `${businessScopedPath(businessId)}/customers`;
}

export async function listCustomers(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: ListCustomersParams = {},
): Promise<PaginatedResponse<CustomerSummary[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await apiListCustomers(
      scope.accessToken,
      scope.businessId,
      params,
    );

    for (const customer of response.items) {
      await upsertCacheRecord({
        userId: scope.userId,
        businessId: scope.businessId,
        entityType: "customer",
        serverId: customer.id,
        data: customer,
      });
    }

    await pruneCacheHistory(
      scope.userId,
      scope.businessId,
      "customer",
      CACHE_HISTORY_LIMIT,
    );

    const merged = await mergePendingIntoList(
      scope.userId,
      scope.businessId,
      "customer",
      response.items,
    );

    return {
      ...response,
      items: merged,
      total: merged.length,
    };
  }

  const cached = await listCacheRecords<CustomerSummary>(
    scope.userId,
    scope.businessId,
    "customer",
  );

  let items = cached.map((record) => record.data);

  if (params.isActive !== undefined) {
    items = items.filter((customer) => customer.isActive === params.isActive);
  }

  if (params.search) {
    const query = params.search.toLowerCase();
    items = items.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        customer.phone?.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query),
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

export async function createCustomer(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  input: CreateCustomerPayload,
): Promise<CustomerDetail> {
  if (isOnlineStatus(networkStatus)) {
    const customer = await apiCreateCustomer(
      scope.accessToken,
      scope.businessId,
      input,
      createIdempotencyKey("create-customer"),
    );

    await upsertCacheRecord({
      userId: scope.userId,
      businessId: scope.businessId,
      entityType: "customer",
      serverId: customer.id,
      data: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        isActive: customer.isActive,
        outstandingBalance: customer.outstandingBalance,
        walletBalance: customer.walletBalance,
        createdAt: customer.createdAt,
      },
    });

    return customer;
  }

  const localId = createLocalId("customer");
  const now = new Date().toISOString();
  const pendingSummary: CustomerSummary = {
    id: localId,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    isActive: true,
    outstandingBalance: "0.0000",
    walletBalance: "0.0000",
    createdAt: now,
  };

  const pendingDetail: CustomerDetail = {
    id: localId,
    businessId: scope.businessId,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    isActive: true,
    outstandingBalance: "0.0000",
    walletBalance: "0.0000",
    openDebtCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await upsertCacheRecord({
    userId: scope.userId,
    businessId: scope.businessId,
    entityType: "customer",
    localId,
    data: pendingSummary,
    pendingSync: true,
    syncedAt: null,
  });

  const queueLocalId = createLocalId("queue");
  const idempotencyKey = createIdempotencyKey("create-customer");

  await enqueueSyncOperation({
    localId: queueLocalId,
    userId: scope.userId,
    businessId: scope.businessId,
    operationType: "CREATE_CUSTOMER",
    entityType: "customer",
    entityLocalId: localId,
    endpoint: customersPath(scope.businessId),
    method: "POST",
    payload: input as unknown as Record<string, unknown>,
    idempotencyKey,
  });

  return pendingDetail;
}
