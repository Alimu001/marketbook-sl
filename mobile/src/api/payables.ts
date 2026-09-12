import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type {
  BusinessPayableListItem,
  ListBusinessPayablesParams,
  ListSupplierPaymentsParams,
  RecordSupplierPaymentPayload,
  RecordSupplierPaymentResponse,
  SupplierPayableSummary,
  SupplierPayment,
} from "@/suppliers/types";
import type { PaginatedResponse } from "./errors";

function payablesPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/payables${suffix}`;
}

function buildListQuery(params: ListBusinessPayablesParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  searchParams.set("limit", String(params.limit ?? 20));

  if (params.status) {
    searchParams.set("status", params.status);
  }

  if (params.search) {
    searchParams.set("search", params.search);
  }

  if (params.supplierId) {
    searchParams.set("supplierId", params.supplierId);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function buildPaymentsQuery(params: ListSupplierPaymentsParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  searchParams.set("limit", String(params.limit ?? 20));

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listBusinessPayables(
  accessToken: string,
  businessId: string,
  params: ListBusinessPayablesParams = {},
): Promise<PaginatedResponse<BusinessPayableListItem[]>> {
  return apiRequestPaginated<BusinessPayableListItem[]>(
    `${payablesPath(businessId)}${buildListQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getPayable(
  accessToken: string,
  businessId: string,
  payableId: string,
): Promise<SupplierPayableSummary> {
  return apiRequest<SupplierPayableSummary>(
    payablesPath(businessId, `/${payableId}`),
    {
      method: "GET",
      accessToken,
    },
  );
}

export function recordPayablePayment(
  accessToken: string,
  businessId: string,
  payableId: string,
  input: RecordSupplierPaymentPayload,
): Promise<RecordSupplierPaymentResponse> {
  return apiRequest<RecordSupplierPaymentResponse>(
    payablesPath(businessId, `/${payableId}/payments`),
    {
      method: "POST",
      accessToken,
      body: input,
    },
  );
}

export function listPayablePayments(
  accessToken: string,
  businessId: string,
  payableId: string,
  params: ListSupplierPaymentsParams = {},
): Promise<PaginatedResponse<SupplierPayment[]>> {
  return apiRequestPaginated<SupplierPayment[]>(
    `${payablesPath(businessId, `/${payableId}/payments`)}${buildPaymentsQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}
