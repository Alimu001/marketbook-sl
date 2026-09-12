import { listProducts as apiListProducts } from "@/api/products";
import { listInventory as apiListInventory } from "@/api/inventory";
import { listSales as apiListSales } from "@/api/sales";
import { listPurchases as apiListPurchases } from "@/api/purchases";
import { listBusinessDebts as apiListDebts } from "@/api/debts";
import { listBusinessPayables as apiListPayables } from "@/api/payables";
import {
  listPayments as apiListPayments,
  type ListPaymentsParams,
  type PaymentListItem,
} from "@/api/payments";
import { ApiError, type PaginatedResponse } from "@/api/errors";
import type { Product } from "@/products/types";
import type { ListSalesParams, SaleListItem } from "@/sales/types";
import type {
  BusinessPayableListItem,
  ListBusinessPayablesParams,
  ListPurchasesParams,
  PurchaseListItem,
} from "@/suppliers/types";
import type {
  BusinessDebtListItem,
  ListBusinessDebtsParams,
} from "@/customers/types";
import type {
  InventoryListItem,
  ListInventoryParams,
} from "@/inventory/types";
import {
  listCacheRecords,
  pruneCacheHistory,
  upsertCacheRecord,
} from "../cache/base";
import { isOnlineStatus } from "../network";
import type { NetworkStatus, SyncScope } from "../types";
import { CACHE_HISTORY_LIMIT } from "../types";
import { listSyncQueueItems } from "../syncQueue";
import { addQuantities, subtractQuantities } from "@/inventory/quantity";
import { mergePendingIntoList } from "../syncEngine";

async function tryOnline<T>(request: () => Promise<T>): Promise<T | null> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) return null;
    throw error;
  }
}

function paginate<T>(items: T[], page = 1, limit = 20): PaginatedResponse<T[]> {
  const start = (page - 1) * limit;
  return { items: items.slice(start, start + limit), page, limit, total: items.length };
}

async function cacheList<T extends { id: string }>(
  scope: SyncScope,
  entityType: "sale" | "purchase" | "debt" | "payable" | "payment",
  items: T[],
): Promise<void> {
  for (const item of items) {
    await upsertCacheRecord({
      userId: scope.userId,
      businessId: scope.businessId,
      entityType,
      serverId: item.id,
      data: item,
    });
  }
  await pruneCacheHistory(scope.userId, scope.businessId, entityType, CACHE_HISTORY_LIMIT);
}

export async function listProducts(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: { page?: number; limit?: number; search?: string; isActive?: boolean } = {},
): Promise<PaginatedResponse<Product[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await tryOnline(() => apiListProducts(
      scope.accessToken,
      scope.businessId,
      params,
    ));

    for (const product of response?.items ?? []) {
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

    if (response) return response;
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
  params: ListInventoryParams = {},
): Promise<PaginatedResponse<InventoryListItem[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await tryOnline(() => apiListInventory(
      scope.accessToken,
      scope.businessId,
      params,
    ));

    for (const item of response?.items ?? []) {
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

    if (response) return response;
  }

  const cached = await listCacheRecords<InventoryListItem>(
    scope.userId,
    scope.businessId,
    "inventory",
  );

  let items = cached.map((record) => record.data);

  const queuedSales = (await listSyncQueueItems(scope.userId, scope.businessId))
    .filter(
      (entry) =>
        entry.operationType === "CREATE_SALE" &&
        (entry.status === "PENDING" || entry.status === "SYNCING"),
    );
  const reservedByProduct = new Map<string, string>();
  for (const queuedSale of queuedSales) {
    const saleItems = Array.isArray(queuedSale.payload.items)
      ? queuedSale.payload.items
      : [];
    for (const rawItem of saleItems) {
      if (
        typeof rawItem === "object" &&
        rawItem !== null &&
        "productId" in rawItem &&
        "quantity" in rawItem
      ) {
        const productId = String(rawItem.productId);
        const quantity = String(rawItem.quantity);
        const current = reservedByProduct.get(productId) ?? "0";
        const reserved = addQuantities(current, quantity);
        if (reserved) reservedByProduct.set(productId, reserved);
      }
    }
  }
  items = items.map((item) => ({
    ...item,
    quantity:
      subtractQuantities(item.quantity, reservedByProduct.get(item.productId) ?? "0") ?? "0",
  }));

  if (params.isActive !== undefined) {
    items = items.filter((item) => item.isActive === params.isActive);
  }

  if (params.lowStock !== undefined) {
    items = items.filter((item) => item.isLowStock === params.lowStock);
  }

  if (params.search) {
    const query = params.search.toLowerCase();
    items = items.filter(
      (item) =>
        item.productName.toLowerCase().includes(query) ||
        item.sku?.toLowerCase().includes(query) ||
        item.barcode?.toLowerCase().includes(query),
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

export async function listSales(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: ListSalesParams = {},
): Promise<PaginatedResponse<SaleListItem[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await tryOnline(() => apiListSales(scope.accessToken, scope.businessId, params));
    if (response) {
      await cacheList(scope, "sale", response.items);
      const merged = await mergePendingIntoList(
        scope.userId,
        scope.businessId,
        "sale",
        response.items,
      );
      return { ...response, items: merged, total: response.total + (merged.length - response.items.length) };
    }
  }
  let items = (await listCacheRecords<SaleListItem>(scope.userId, scope.businessId, "sale")).map((entry) => entry.data);
  if (params.paymentMethod) items = items.filter((item) => item.paymentMethod === params.paymentMethod);
  if (params.paymentStatus) items = items.filter((item) => item.paymentStatus === params.paymentStatus);
  if (params.from) items = items.filter((item) => item.createdAt >= params.from!);
  if (params.to) items = items.filter((item) => item.createdAt <= params.to!);
  return paginate(items, params.page, params.limit);
}

export async function listPurchases(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: ListPurchasesParams = {},
): Promise<PaginatedResponse<PurchaseListItem[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await tryOnline(() => apiListPurchases(scope.accessToken, scope.businessId, params));
    if (response) {
      await cacheList(scope, "purchase", response.items);
      return response;
    }
  }
  let items = (await listCacheRecords<PurchaseListItem>(scope.userId, scope.businessId, "purchase")).map((entry) => entry.data);
  if (params.supplierId) items = items.filter((item) => item.supplier.id === params.supplierId);
  if (params.paymentStatus) items = items.filter((item) => item.paymentStatus === params.paymentStatus);
  if (params.from) items = items.filter((item) => item.createdAt >= params.from!);
  if (params.to) items = items.filter((item) => item.createdAt <= params.to!);
  return paginate(items, params.page, params.limit);
}

export async function listDebts(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: ListBusinessDebtsParams = {},
): Promise<PaginatedResponse<BusinessDebtListItem[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await tryOnline(() => apiListDebts(scope.accessToken, scope.businessId, params));
    if (response) {
      await cacheList(scope, "debt", response.items);
      return response;
    }
  }
  let items = (await listCacheRecords<BusinessDebtListItem>(scope.userId, scope.businessId, "debt")).map((entry) => entry.data);
  if (params.status) items = items.filter((item) => item.status === params.status);
  if (params.customerId) items = items.filter((item) => item.customer.id === params.customerId);
  if (params.search) {
    const query = params.search.toLowerCase();
    items = items.filter((item) => item.customer.name.toLowerCase().includes(query) || item.receiptNumber.toLowerCase().includes(query));
  }
  return paginate(items, params.page, params.limit);
}

export async function listPayables(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: ListBusinessPayablesParams = {},
): Promise<PaginatedResponse<BusinessPayableListItem[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await tryOnline(() => apiListPayables(scope.accessToken, scope.businessId, params));
    if (response) {
      await cacheList(scope, "payable", response.items);
      return response;
    }
  }
  let items = (await listCacheRecords<BusinessPayableListItem>(scope.userId, scope.businessId, "payable")).map((entry) => entry.data);
  if (params.status) items = items.filter((item) => item.status === params.status);
  if (params.supplierId) items = items.filter((item) => item.supplier.id === params.supplierId);
  if (params.search) {
    const query = params.search.toLowerCase();
    items = items.filter((item) => item.supplier.name.toLowerCase().includes(query) || item.purchaseNumber.toLowerCase().includes(query));
  }
  return paginate(items, params.page, params.limit);
}

export async function listPayments(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: ListPaymentsParams = {},
): Promise<PaginatedResponse<PaymentListItem[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await tryOnline(() => apiListPayments(scope.accessToken, scope.businessId, params));
    if (response) {
      await cacheList(scope, "payment", response.items);
      return response;
    }
  }
  let items = (await listCacheRecords<PaymentListItem>(scope.userId, scope.businessId, "payment")).map((entry) => entry.data);
  if (params.status) items = items.filter((item) => item.status === params.status);
  if (params.provider) items = items.filter((item) => item.provider === params.provider);
  if (params.from) items = items.filter((item) => item.createdAt >= params.from!);
  if (params.to) items = items.filter((item) => item.createdAt <= params.to!);
  return paginate(items, params.page, params.limit);
}
