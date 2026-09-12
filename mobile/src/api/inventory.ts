import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type {
  InventoryBalance,
  InventoryListItem,
  InventoryTransaction,
  ListInventoryParams,
  OpeningStockPayload,
  StockAdjustmentPayload,
  UpdateThresholdPayload,
} from "@/inventory/types";
import type { PaginatedResponse } from "./errors";

function inventoryListPath(businessId: string): string {
  return `${businessScopedPath(businessId)}/inventory`;
}

function productInventoryPath(
  businessId: string,
  productId: string,
  suffix = "",
): string {
  return `${businessScopedPath(businessId)}/products/${productId}/inventory${suffix}`;
}

function buildListQuery(params: ListInventoryParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  searchParams.set("limit", String(params.limit ?? 20));

  if (params.search) {
    searchParams.set("search", params.search);
  }

  if (params.lowStock !== undefined) {
    searchParams.set("lowStock", params.lowStock ? "true" : "false");
  }

  if (params.isActive !== undefined) {
    searchParams.set("isActive", params.isActive ? "true" : "false");
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listInventory(
  accessToken: string,
  businessId: string,
  params: ListInventoryParams = {},
): Promise<PaginatedResponse<InventoryListItem[]>> {
  return apiRequestPaginated<InventoryListItem[]>(
    `${inventoryListPath(businessId)}${buildListQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getInventory(
  accessToken: string,
  businessId: string,
  productId: string,
): Promise<InventoryBalance> {
  return apiRequest<InventoryBalance>(
    productInventoryPath(businessId, productId),
    {
      method: "GET",
      accessToken,
    },
  );
}

export function setOpeningStock(
  accessToken: string,
  businessId: string,
  productId: string,
  input: OpeningStockPayload,
): Promise<InventoryBalance> {
  return apiRequest<InventoryBalance>(
    productInventoryPath(businessId, productId, "/opening"),
    {
      method: "POST",
      accessToken,
      body: input,
    },
  );
}

export function adjustInventory(
  accessToken: string,
  businessId: string,
  productId: string,
  input: StockAdjustmentPayload,
): Promise<InventoryBalance> {
  return apiRequest<InventoryBalance>(
    productInventoryPath(businessId, productId, "/adjust"),
    {
      method: "POST",
      accessToken,
      body: input,
    },
  );
}

export function updateLowStockThreshold(
  accessToken: string,
  businessId: string,
  productId: string,
  input: UpdateThresholdPayload,
): Promise<InventoryBalance> {
  return apiRequest<InventoryBalance>(
    productInventoryPath(businessId, productId, "/threshold"),
    {
      method: "PATCH",
      accessToken,
      body: input,
    },
  );
}

export function getInventoryHistory(
  accessToken: string,
  businessId: string,
  productId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedResponse<InventoryTransaction[]>> {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(params.page ?? 1));
  searchParams.set("limit", String(params.limit ?? 20));

  return apiRequestPaginated<InventoryTransaction[]>(
    `${productInventoryPath(businessId, productId, "/history")}?${searchParams.toString()}`,
    {
      method: "GET",
      accessToken,
    },
  );
}
