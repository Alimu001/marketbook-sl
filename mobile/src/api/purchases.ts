import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type {
  CreatePurchasePayload,
  ListPurchasesParams,
  PurchaseDetail,
  PurchaseListItem,
} from "@/suppliers/types";
import type { PaginatedResponse } from "./errors";

function purchasesPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/purchases${suffix}`;
}

function buildListQuery(params: ListPurchasesParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  searchParams.set("limit", String(params.limit ?? 20));

  if (params.supplierId) {
    searchParams.set("supplierId", params.supplierId);
  }

  if (params.paymentStatus) {
    searchParams.set("paymentStatus", params.paymentStatus);
  }

  if (params.from) {
    searchParams.set("from", params.from);
  }

  if (params.to) {
    searchParams.set("to", params.to);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listPurchases(
  accessToken: string,
  businessId: string,
  params: ListPurchasesParams = {},
): Promise<PaginatedResponse<PurchaseListItem[]>> {
  return apiRequestPaginated<PurchaseListItem[]>(
    `${purchasesPath(businessId)}${buildListQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getPurchase(
  accessToken: string,
  businessId: string,
  purchaseId: string,
): Promise<PurchaseDetail> {
  return apiRequest<PurchaseDetail>(
    purchasesPath(businessId, `/${purchaseId}`),
    {
      method: "GET",
      accessToken,
    },
  );
}

export function createPurchase(
  accessToken: string,
  businessId: string,
  input: CreatePurchasePayload,
): Promise<{ purchase: PurchaseDetail }> {
  return apiRequest<{ purchase: PurchaseDetail }>(purchasesPath(businessId), {
    method: "POST",
    accessToken,
    body: input,
  });
}
