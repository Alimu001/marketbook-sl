import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type {
  CreateSalePayload,
  ListSalesParams,
  SaleDetail,
  SaleListItem,
} from "@/sales/types";
import type { PaginatedResponse } from "./errors";

function salesPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/sales${suffix}`;
}

function buildListQuery(params: ListSalesParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  searchParams.set("limit", String(params.limit ?? 20));

  if (params.paymentMethod) {
    searchParams.set("paymentMethod", params.paymentMethod);
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

export function listSales(
  accessToken: string,
  businessId: string,
  params: ListSalesParams = {},
): Promise<PaginatedResponse<SaleListItem[]>> {
  return apiRequestPaginated<SaleListItem[]>(
    `${salesPath(businessId)}${buildListQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getSale(
  accessToken: string,
  businessId: string,
  saleId: string,
): Promise<SaleDetail> {
  return apiRequest<SaleDetail>(salesPath(businessId, `/${saleId}`), {
    method: "GET",
    accessToken,
  });
}

export function createSale(
  accessToken: string,
  businessId: string,
  input: CreateSalePayload,
): Promise<{ sale: SaleDetail }> {
  return apiRequest<{ sale: SaleDetail }>(salesPath(businessId), {
    method: "POST",
    accessToken,
    body: input,
  });
}
