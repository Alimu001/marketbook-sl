import {
  createExpense as apiCreateExpense,
  listExpenseCategories as apiListExpenseCategories,
  listExpenses as apiListExpenses,
} from "@/api/expenses";
import { businessScopedPath } from "@/api/businesses";
import type { PaginatedResponse } from "@/api/errors";
import type {
  CreateExpensePayload,
  ExpenseCategorySummary,
  ExpenseDetail,
  ExpenseListItem,
  ListExpensesParams,
} from "@/expenses/types";
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
import { CACHE_HISTORY_LIMIT, OFFLINE_ERROR_CODES } from "../types";

function expensesPath(businessId: string): string {
  return `${businessScopedPath(businessId)}/expenses`;
}

export async function listExpenseCategories(
  scope: SyncScope,
  networkStatus: NetworkStatus,
): Promise<ExpenseCategorySummary[]> {
  if (isOnlineStatus(networkStatus)) {
    const categories = await apiListExpenseCategories(
      scope.accessToken,
      scope.businessId,
      { isActive: true },
    );

    for (const category of categories) {
      await upsertCacheRecord({
        userId: scope.userId,
        businessId: scope.businessId,
        entityType: "expense_category",
        serverId: category.id,
        data: category,
      });
    }

    return categories;
  }

  const cached = await listCacheRecords<ExpenseCategorySummary>(
    scope.userId,
    scope.businessId,
    "expense_category",
  );

  return cached.map((record) => record.data);
}

export async function listExpenses(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  params: ListExpensesParams = {},
): Promise<PaginatedResponse<ExpenseListItem[]>> {
  if (isOnlineStatus(networkStatus)) {
    const response = await apiListExpenses(
      scope.accessToken,
      scope.businessId,
      params,
    );

    for (const expense of response.items) {
      await upsertCacheRecord({
        userId: scope.userId,
        businessId: scope.businessId,
        entityType: "expense",
        serverId: expense.id,
        data: expense,
      });
    }

    await pruneCacheHistory(
      scope.userId,
      scope.businessId,
      "expense",
      CACHE_HISTORY_LIMIT,
    );

    const merged = await mergePendingIntoList(
      scope.userId,
      scope.businessId,
      "expense",
      response.items,
    );

    return {
      ...response,
      items: merged,
      total: merged.length,
    };
  }

  const cached = await listCacheRecords<ExpenseListItem>(
    scope.userId,
    scope.businessId,
    "expense",
  );

  let items = cached.map((record) => record.data);

  if (params.isArchived !== undefined) {
    items = items.filter((expense) => expense.isArchived === params.isArchived);
  }

  if (params.search) {
    const query = params.search.toLowerCase();
    items = items.filter(
      (expense) =>
        expense.description.toLowerCase().includes(query) ||
        expense.vendorOrPayee?.toLowerCase().includes(query),
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

export async function createExpense(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  input: CreateExpensePayload,
): Promise<ExpenseDetail> {
  const categories = await listExpenseCategories(scope, networkStatus);
  const category = categories.find((entry) => entry.id === input.categoryId);

  if (!category || !category.id || category.id.startsWith("local:")) {
    throw new Error(OFFLINE_ERROR_CODES.OFFLINE);
  }

  if (isOnlineStatus(networkStatus)) {
    const expense = await apiCreateExpense(
      scope.accessToken,
      scope.businessId,
      input,
      createIdempotencyKey("create-expense"),
    );

    await upsertCacheRecord({
      userId: scope.userId,
      businessId: scope.businessId,
      entityType: "expense",
      serverId: expense.id,
      data: {
        id: expense.id,
        amount: expense.amount,
        category: expense.category,
        paymentMethod: expense.paymentMethod,
        expenseDate: expense.expenseDate,
        vendorOrPayee: expense.vendorOrPayee,
        description: expense.description,
        isArchived: expense.isArchived,
        recordedBy: expense.recordedBy,
        createdAt: expense.createdAt,
      },
    });

    return expense;
  }

  const localId = createLocalId("expense");
  const now = new Date().toISOString();

  const pendingListItem: ExpenseListItem = {
    id: localId,
    amount: input.amount,
    category: {
      id: category.id,
      name: category.name,
      isActive: category.isActive,
    },
    paymentMethod: input.paymentMethod,
    expenseDate: input.expenseDate,
    vendorOrPayee: input.vendorOrPayee ?? null,
    description: input.description,
    isArchived: false,
    recordedBy: {
      id: scope.userId,
      name: null,
      email: "offline@device.local",
    },
    createdAt: now,
  };

  const pendingDetail: ExpenseDetail = {
    id: localId,
    businessId: scope.businessId,
    amount: input.amount,
    category: pendingListItem.category,
    paymentMethod: input.paymentMethod,
    expenseDate: input.expenseDate,
    vendorOrPayee: input.vendorOrPayee ?? null,
    referenceNumber: input.referenceNumber ?? null,
    description: input.description,
    notes: input.notes ?? null,
    isArchived: false,
    recordedBy: pendingListItem.recordedBy,
    createdAt: now,
    updatedAt: now,
  };

  await upsertCacheRecord({
    userId: scope.userId,
    businessId: scope.businessId,
    entityType: "expense",
    localId,
    data: pendingListItem,
    pendingSync: true,
    syncedAt: null,
  });

  await enqueueSyncOperation({
    localId: createLocalId("queue"),
    userId: scope.userId,
    businessId: scope.businessId,
    operationType: "CREATE_EXPENSE",
    entityType: "expense",
    entityLocalId: localId,
    endpoint: expensesPath(scope.businessId),
    method: "POST",
    payload: input as unknown as Record<string, unknown>,
    idempotencyKey: createIdempotencyKey("create-expense"),
  });

  return pendingDetail;
}
