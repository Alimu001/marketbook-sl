import { listProducts as apiListProducts } from "@/api/products";
import { listInventory as apiListInventory } from "@/api/inventory";
import type { PaginatedResponse } from "@/api/errors";
import type { Product } from "@/products/types";
import type { InventoryListItem } from "@/inventory/types";
import {
  listCacheRecords,
  pruneCacheHistory,
  upsertCacheRecord,
} from "../cache/base";
import { isOnlineStatus } from "../network";
import type { NetworkStatus, SyncScope } from "../types";
import { CACHE_HISTORY_LIMIT } from "../types";

export async function listProducts(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: { page?: number; limit?: number; search?: string; isActive?: boolean } = {},
): Promise<PaginatedResponse<Product[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await apiListProducts(
      scope.accessToken,
      scope.businessId,
      params,
    );

    for (const product of response.items) {
      await upsertCacheRecord({
        userId: scope.userId,
        businessId: scope.businessId,
        entityType: "product",
        serverId: product.id,
        data: product,
      });
    }

    await pruneCacheHistory(
      scope.userId,
      scope.businessId,
      "product",
      500,
    );

    return response;
  }

  const cached = await listCacheRecords<Product>(
    scope.userId,
    scope.businessId,
    "product",
  );

  let items = cached.map((record) => record.data);

  if (params.isActive !== undefined) {
    items = items.filter((product) => product.isActive === params.isActive);
  }

  if (params.search) {
    const query = params.search.toLowerCase();
    items = items.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.sku?.toLowerCase().includes(query),
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

export async function listInventory(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: { page?: number; limit?: number; search?: string } = {},
): Promise<PaginatedResponse<InventoryListItem[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await apiListInventory(
      scope.accessToken,
      scope.businessId,
      params,
    );

    for (const item of response.items) {
      await upsertCacheRecord({
        userId: scope.userId,
        businessId: scope.businessId,
        entityType: "inventory",
        serverId: item.productId,
        data: item,
      });
    }

    await pruneCacheHistory(
      scope.userId,
      scope.businessId,
      "inventory",
      500,
    );

    return response;
  }

  const cached = await listCacheRecords<InventoryListItem>(
    scope.userId,
    scope.businessId,
    "inventory",
  );

  let items = cached.map((record) => record.data);

  if (params.search) {
    const query = params.search.toLowerCase();
    items = items.filter((item) =>
      item.productName.toLowerCase().includes(query),
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

export async function listPaymentsCached(
  scope: SyncScope,
  networkStatus: NetworkStatus,
): Promise<void> {
  if (!isOnlineStatus(networkStatus)) {
    return;
  }

  const { listPayments } = await import("@/api/payments");
  const response = await listPayments(scope.accessToken, scope.businessId, {
    limit: CACHE_HISTORY_LIMIT,
    page: 1,
  });

  for (const payment of response.items) {
    await upsertCacheRecord({
      userId: scope.userId,
      businessId: scope.businessId,
      entityType: "payment",
      serverId: payment.id,
      data: payment,
    });
  }
}
