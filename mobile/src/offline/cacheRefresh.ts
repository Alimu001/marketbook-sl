import { listBusinesses } from "@/api/businesses";
import { listCustomers as apiListCustomers } from "@/api/customers";
import { listBusinessDebts } from "@/api/debts";
import {
  listExpenseCategories,
  listExpenses as apiListExpenses,
} from "@/api/expenses";
import { listInventory } from "@/api/inventory";
import { listBusinessPayables } from "@/api/payables";
import { listPayments } from "@/api/payments";
import { listProducts } from "@/api/products";
import { listPurchases } from "@/api/purchases";
import { listSales } from "@/api/sales";
import { listSuppliers as apiListSuppliers } from "@/api/suppliers";
import {
  pruneCacheHistory,
  setSyncMetadata,
  upsertCacheRecord,
} from "./cache/base";
import { CACHE_HISTORY_LIMIT } from "./types";
import type { SyncScope } from "./types";

const API_PAGE_LIMIT = 100;
const LARGE_CACHE_LIMIT = 500;

async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<{
    items: T[];
    total: number;
  }>,
  maxItems = LARGE_CACHE_LIMIT,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;

  while (items.length < maxItems) {
    const response = await fetchPage(page, API_PAGE_LIMIT);

    items.push(...response.items);

    if (
      response.items.length < API_PAGE_LIMIT ||
      items.length >= response.total ||
      items.length >= maxItems
    ) {
      break;
    }

    page += 1;
  }

  return items.slice(0, maxItems);
}

export async function refreshReadCaches(scope: SyncScope): Promise<void> {
  const [
    businesses,
    products,
    inventory,
    customers,
    suppliers,
    sales,
    purchases,
    expenses,
    categories,
    debts,
    payables,
    payments,
  ] = await Promise.all([
    listBusinesses(scope.accessToken),

    fetchAllPages((page, limit) =>
      listProducts(scope.accessToken, scope.businessId, {
        limit,
        page,
      }),
    ),

    fetchAllPages((page, limit) =>
      listInventory(scope.accessToken, scope.businessId, {
        limit,
        page,
      }),
    ),

    fetchAllPages((page, limit) =>
      apiListCustomers(scope.accessToken, scope.businessId, {
        limit,
        page,
      }),
    ),

    fetchAllPages((page, limit) =>
      apiListSuppliers(scope.accessToken, scope.businessId, {
        limit,
        page,
      }),
    ),

    listSales(scope.accessToken, scope.businessId, {
      limit: Math.min(CACHE_HISTORY_LIMIT, API_PAGE_LIMIT),
      page: 1,
    }),

    listPurchases(scope.accessToken, scope.businessId, {
      limit: Math.min(CACHE_HISTORY_LIMIT, API_PAGE_LIMIT),
      page: 1,
    }),

    apiListExpenses(scope.accessToken, scope.businessId, {
      limit: Math.min(CACHE_HISTORY_LIMIT, API_PAGE_LIMIT),
      page: 1,
    }),

    listExpenseCategories(scope.accessToken, scope.businessId, {
      isActive: true,
    }),

    listBusinessDebts(scope.accessToken, scope.businessId, {
      limit: Math.min(CACHE_HISTORY_LIMIT, API_PAGE_LIMIT),
      page: 1,
    }),

    listBusinessPayables(scope.accessToken, scope.businessId, {
      limit: Math.min(CACHE_HISTORY_LIMIT, API_PAGE_LIMIT),
      page: 1,
    }),

    listPayments(scope.accessToken, scope.businessId, {
      limit: Math.min(CACHE_HISTORY_LIMIT, API_PAGE_LIMIT),
      page: 1,
    }),
  ]);

  for (const business of businesses) {
    await upsertCacheRecord({
      userId: scope.userId,
      businessId: scope.businessId,
      entityType: "business",
      serverId: business.id,
      data: business,
    });
  }

  const upsertMany = async (
    entityType:
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
      | "payment",
    items: Array<{ id: string }>,
  ) => {
    for (const item of items) {
      await upsertCacheRecord({
        userId: scope.userId,
        businessId: scope.businessId,
        entityType,
        serverId: item.id,
        data: item,
      });
    }

    await pruneCacheHistory(
      scope.userId,
      scope.businessId,
      entityType,
      entityType === "product" ||
        entityType === "customer" ||
        entityType === "supplier" ||
        entityType === "expense_category"
        ? LARGE_CACHE_LIMIT
        : CACHE_HISTORY_LIMIT,
    );
  };

  await upsertMany("product", products);

  await upsertMany(
    "inventory",
    inventory.map((item) => ({
      ...item,
      id: item.productId,
    })),
  );

  await upsertMany("customer", customers);
  await upsertMany("supplier", suppliers);
  await upsertMany("sale", sales.items);
  await upsertMany("purchase", purchases.items);
  await upsertMany("expense", expenses.items);
  await upsertMany("expense_category", categories);
  await upsertMany("debt", debts.items);
  await upsertMany("payable", payables.items);
  await upsertMany("payment", payments.items);

  const now = new Date().toISOString();

  await setSyncMetadata(
    scope.userId,
    scope.businessId,
    "last_refreshed_at",
    now,
  );
}