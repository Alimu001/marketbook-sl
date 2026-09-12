import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type {
  CreateSupplierPayload,
  ListSupplierPayablesParams,
  ListSuppliersParams,
  SupplierDetail,
  SupplierHistory,
  SupplierPayableSummary,
  SupplierSummary,
  UpdateSupplierPayload,
} from "@/suppliers/types";
import type { PaginatedResponse } from "./errors";

function suppliersPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/suppliers${suffix}`;
}

function buildListQuery(params: ListSuppliersParams): string {
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

  if (params.hasPayable !== undefined) {
    searchParams.set("hasPayable", params.hasPayable ? "true" : "false");
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function buildPayablesQuery(params: ListSupplierPayablesParams): string {
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

export function listSuppliers(
  accessToken: string,
  businessId: string,
  params: ListSuppliersParams = {},
): Promise<PaginatedResponse<SupplierSummary[]>> {
  return apiRequestPaginated<SupplierSummary[]>(
    `${suppliersPath(businessId)}${buildListQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getSupplier(
  accessToken: string,
  businessId: string,
  supplierId: string,
): Promise<SupplierDetail> {
  return apiRequest<SupplierDetail>(
    suppliersPath(businessId, `/${supplierId}`),
    {
      method: "GET",
      accessToken,
    },
  );
}

export function createSupplier(
  accessToken: string,
  businessId: string,
  input: CreateSupplierPayload,
  idempotencyKey?: string,
): Promise<SupplierDetail> {
  return apiRequest<SupplierDetail>(suppliersPath(businessId), {
    method: "POST",
    accessToken,
    body: input,
    ...(idempotencyKey
      ? { headers: { "Idempotency-Key": idempotencyKey } }
      : {}),
  });
}

export function updateSupplier(
  accessToken: string,
  businessId: string,
  supplierId: string,
  input: UpdateSupplierPayload,
): Promise<SupplierDetail> {
  return apiRequest<SupplierDetail>(
    suppliersPath(businessId, `/${supplierId}`),
    {
      method: "PATCH",
      accessToken,
      body: input,
    },
  );
}

export function archiveSupplier(
  accessToken: string,
  businessId: string,
  supplierId: string,
): Promise<SupplierDetail> {
  return apiRequest<SupplierDetail>(
    suppliersPath(businessId, `/${supplierId}/archive`),
    {
      method: "PATCH",
      accessToken,
    },
  );
}

export function restoreSupplier(
  accessToken: string,
  businessId: string,
  supplierId: string,
): Promise<SupplierDetail> {
  return apiRequest<SupplierDetail>(
    suppliersPath(businessId, `/${supplierId}/restore`),
    {
      method: "PATCH",
      accessToken,
    },
  );
}

export function listSupplierPayables(
  accessToken: string,
  businessId: string,
  supplierId: string,
  params: ListSupplierPayablesParams = {},
): Promise<PaginatedResponse<SupplierPayableSummary[]>> {
  return apiRequestPaginated<SupplierPayableSummary[]>(
    `${suppliersPath(businessId, `/${supplierId}/payables`)}${buildPayablesQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getSupplierHistory(
  accessToken: string,
  businessId: string,
  supplierId: string,
): Promise<SupplierHistory> {
  return apiRequest<SupplierHistory>(
    suppliersPath(businessId, `/${supplierId}/history`),
    {
      method: "GET",
      accessToken,
    },
  );
}
