import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type {
  CreateExpenseCategoryPayload,
  CreateExpensePayload,
  ExpenseCategorySummary,
  ExpenseDetail,
  ExpenseListItem,
  ListExpenseCategoriesParams,
  ListExpensesParams,
  UpdateExpenseCategoryPayload,
  UpdateExpensePayload,
} from "@/expenses/types";
import type { PaginatedResponse } from "./errors";

function expenseCategoriesPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/expense-categories${suffix}`;
}

function expensesPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/expenses${suffix}`;
}

function buildExpensesQuery(params: ListExpensesParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  searchParams.set("limit", String(params.limit ?? 20));

  if (params.categoryId) {
    searchParams.set("categoryId", params.categoryId);
  }

  if (params.paymentMethod) {
    searchParams.set("paymentMethod", params.paymentMethod);
  }

  if (params.from) {
    searchParams.set("from", params.from);
  }

  if (params.to) {
    searchParams.set("to", params.to);
  }

  if (params.search) {
    searchParams.set("search", params.search);
  }

  if (params.isArchived !== undefined) {
    searchParams.set("isArchived", params.isArchived ? "true" : "false");
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function buildCategoriesQuery(params: ListExpenseCategoriesParams): string {
  const searchParams = new URLSearchParams();

  if (params.isActive !== undefined) {
    searchParams.set("isActive", params.isActive ? "true" : "false");
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listExpenseCategories(
  accessToken: string,
  businessId: string,
  params: ListExpenseCategoriesParams = {},
): Promise<ExpenseCategorySummary[]> {
  return apiRequest<ExpenseCategorySummary[]>(
    `${expenseCategoriesPath(businessId)}${buildCategoriesQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function createExpenseCategory(
  accessToken: string,
  businessId: string,
  input: CreateExpenseCategoryPayload,
): Promise<ExpenseCategorySummary> {
  return apiRequest<ExpenseCategorySummary>(expenseCategoriesPath(businessId), {
    method: "POST",
    accessToken,
    body: input,
  });
}

export function updateExpenseCategory(
  accessToken: string,
  businessId: string,
  categoryId: string,
  input: UpdateExpenseCategoryPayload,
): Promise<ExpenseCategorySummary> {
  return apiRequest<ExpenseCategorySummary>(
    expenseCategoriesPath(businessId, `/${categoryId}`),
    {
      method: "PATCH",
      accessToken,
      body: input,
    },
  );
}

export function archiveExpenseCategory(
  accessToken: string,
  businessId: string,
  categoryId: string,
): Promise<ExpenseCategorySummary> {
  return apiRequest<ExpenseCategorySummary>(
    expenseCategoriesPath(businessId, `/${categoryId}/archive`),
    {
      method: "PATCH",
      accessToken,
    },
  );
}

export function restoreExpenseCategory(
  accessToken: string,
  businessId: string,
  categoryId: string,
): Promise<ExpenseCategorySummary> {
  return apiRequest<ExpenseCategorySummary>(
    expenseCategoriesPath(businessId, `/${categoryId}/restore`),
    {
      method: "PATCH",
      accessToken,
    },
  );
}

export function listExpenses(
  accessToken: string,
  businessId: string,
  params: ListExpensesParams = {},
): Promise<PaginatedResponse<ExpenseListItem[]>> {
  return apiRequestPaginated<ExpenseListItem[]>(
    `${expensesPath(businessId)}${buildExpensesQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getExpense(
  accessToken: string,
  businessId: string,
  expenseId: string,
): Promise<ExpenseDetail> {
  return apiRequest<ExpenseDetail>(expensesPath(businessId, `/${expenseId}`), {
    method: "GET",
    accessToken,
  });
}

export function createExpense(
  accessToken: string,
  businessId: string,
  input: CreateExpensePayload,
): Promise<ExpenseDetail> {
  return apiRequest<ExpenseDetail>(expensesPath(businessId), {
    method: "POST",
    accessToken,
    body: input,
  });
}

export function updateExpense(
  accessToken: string,
  businessId: string,
  expenseId: string,
  input: UpdateExpensePayload,
): Promise<ExpenseDetail> {
  return apiRequest<ExpenseDetail>(expensesPath(businessId, `/${expenseId}`), {
    method: "PATCH",
    accessToken,
    body: input,
  });
}

export function archiveExpense(
  accessToken: string,
  businessId: string,
  expenseId: string,
): Promise<ExpenseDetail> {
  return apiRequest<ExpenseDetail>(
    expensesPath(businessId, `/${expenseId}/archive`),
    {
      method: "PATCH",
      accessToken,
    },
  );
}

export function restoreExpense(
  accessToken: string,
  businessId: string,
  expenseId: string,
): Promise<ExpenseDetail> {
  return apiRequest<ExpenseDetail>(
    expensesPath(businessId, `/${expenseId}/restore`),
    {
      method: "PATCH",
      accessToken,
    },
  );
}
