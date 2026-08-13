import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type {
  CreateCustomerPayload,
  CustomerDetail,
  CustomerHistory,
  CustomerSummary,
  ListCustomerDebtsParams,
  ListCustomersParams,
  UpdateCustomerPayload,
} from "@/customers/types";
import type { CustomerDebtSummary } from "@/customers/types";
import type { PaginatedResponse } from "./errors";

function customersPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/customers${suffix}`;
}

function buildListQuery(params: ListCustomersParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  searchParams.set("limit", String(params.limit ?? 20));

  if (params.search) {
    searchParams.set("search", params.search);
  }

  if (params.isActive !== undefined) {
    searchParams.set("isActive", params.isActive ? "true" : "false");
  }

  if (params.hasDebt !== undefined) {
    searchParams.set("hasDebt", params.hasDebt ? "true" : "false");
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function buildDebtsQuery(params: ListCustomerDebtsParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  searchParams.set("limit", String(params.limit ?? 20));

  if (params.status) {
    searchParams.set("status", params.status);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listCustomers(
  accessToken: string,
  businessId: string,
  params: ListCustomersParams = {},
): Promise<PaginatedResponse<CustomerSummary[]>> {
  return apiRequestPaginated<CustomerSummary[]>(
    `${customersPath(businessId)}${buildListQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getCustomer(
  accessToken: string,
  businessId: string,
  customerId: string,
): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(
    customersPath(businessId, `/${customerId}`),
    {
      method: "GET",
      accessToken,
    },
  );
}

export function createCustomer(
  accessToken: string,
  businessId: string,
  input: CreateCustomerPayload,
  idempotencyKey?: string,
): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(customersPath(businessId), {
    method: "POST",
    accessToken,
    body: input,
    ...(idempotencyKey
      ? { headers: { "Idempotency-Key": idempotencyKey } }
      : {}),
  });
}

export function updateCustomer(
  accessToken: string,
  businessId: string,
  customerId: string,
  input: UpdateCustomerPayload,
): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(
    customersPath(businessId, `/${customerId}`),
    {
      method: "PATCH",
      accessToken,
      body: input,
    },
  );
}

export function archiveCustomer(
  accessToken: string,
  businessId: string,
  customerId: string,
): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(
    customersPath(businessId, `/${customerId}/archive`),
    {
      method: "PATCH",
      accessToken,
    },
  );
}

export function restoreCustomer(
  accessToken: string,
  businessId: string,
  customerId: string,
): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(
    customersPath(businessId, `/${customerId}/restore`),
    {
      method: "PATCH",
      accessToken,
    },
  );
}

export function listCustomerDebts(
  accessToken: string,
  businessId: string,
  customerId: string,
  params: ListCustomerDebtsParams = {},
): Promise<PaginatedResponse<CustomerDebtSummary[]>> {
  return apiRequestPaginated<CustomerDebtSummary[]>(
    `${customersPath(businessId, `/${customerId}/debts`)}${buildDebtsQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getCustomerHistory(
  accessToken: string,
  businessId: string,
  customerId: string,
): Promise<CustomerHistory> {
  return apiRequest<CustomerHistory>(
    customersPath(businessId, `/${customerId}/history`),
    {
      method: "GET",
      accessToken,
    },
  );
}
