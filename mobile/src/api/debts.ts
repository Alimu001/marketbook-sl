import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type {
  BusinessDebtListItem,
  CustomerDebtSummary,
  DebtPayment,
  ListBusinessDebtsParams,
  ListDebtPaymentsParams,
  RecordDebtPaymentPayload,
  RecordDebtPaymentResponse,
} from "@/customers/types";
import type { PaginatedResponse } from "./errors";

function debtsPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/debts${suffix}`;
}

function buildListQuery(params: ListBusinessDebtsParams): string {
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

  if (params.customerId) {
    searchParams.set("customerId", params.customerId);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function buildPaymentsQuery(params: ListDebtPaymentsParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  searchParams.set("limit", String(params.limit ?? 20));

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listBusinessDebts(
  accessToken: string,
  businessId: string,
  params: ListBusinessDebtsParams = {},
): Promise<PaginatedResponse<BusinessDebtListItem[]>> {
  return apiRequestPaginated<BusinessDebtListItem[]>(
    `${debtsPath(businessId)}${buildListQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getDebt(
  accessToken: string,
  businessId: string,
  debtId: string,
): Promise<CustomerDebtSummary> {
  return apiRequest<CustomerDebtSummary>(debtsPath(businessId, `/${debtId}`), {
    method: "GET",
    accessToken,
  });
}

export function recordDebtPayment(
  accessToken: string,
  businessId: string,
  debtId: string,
  input: RecordDebtPaymentPayload,
): Promise<RecordDebtPaymentResponse> {
  return apiRequest<RecordDebtPaymentResponse>(
    debtsPath(businessId, `/${debtId}/payments`),
    {
      method: "POST",
      accessToken,
      body: input,
    },
  );
}

export function listDebtPayments(
  accessToken: string,
  businessId: string,
  debtId: string,
  params: ListDebtPaymentsParams = {},
): Promise<PaginatedResponse<DebtPayment[]>> {
  return apiRequestPaginated<DebtPayment[]>(
    `${debtsPath(businessId, `/${debtId}/payments`)}${buildPaymentsQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}
