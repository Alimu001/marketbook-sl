import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type {
  CreateProductPayload,
  ListProductsParams,
  Product,
  UpdateProductPayload,
} from "@/products/types";
import type { PaginatedResponse } from "./errors";

function productsPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/products${suffix}`;
}

function buildListQuery(params: ListProductsParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }

  if (params.search) {
    searchParams.set("search", params.search);
  }

  if (params.isActive !== undefined) {
    searchParams.set("isActive", params.isActive ? "true" : "false");
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listProducts(
  accessToken: string,
  businessId: string,
  params: ListProductsParams = {},
): Promise<PaginatedResponse<Product[]>> {
  return apiRequestPaginated<Product[]>(
    `${productsPath(businessId)}${buildListQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function getProduct(
  accessToken: string,
  businessId: string,
  productId: string,
): Promise<Product> {
  return apiRequest<Product>(productsPath(businessId, `/${productId}`), {
    method: "GET",
    accessToken,
  });
}

export function createProduct(
  accessToken: string,
  businessId: string,
  input: CreateProductPayload,
): Promise<Product> {
  return apiRequest<Product>(productsPath(businessId), {
    method: "POST",
    accessToken,
    body: input,
  });
}

export function updateProduct(
  accessToken: string,
  businessId: string,
  productId: string,
  input: UpdateProductPayload,
): Promise<Product> {
  return apiRequest<Product>(productsPath(businessId, `/${productId}`), {
    method: "PATCH",
    accessToken,
    body: input,
  });
}

export function archiveProduct(
  accessToken: string,
  businessId: string,
  productId: string,
): Promise<Product> {
  return apiRequest<Product>(
    productsPath(businessId, `/${productId}/archive`),
    {
      method: "PATCH",
      accessToken,
    },
  );
}

export function restoreProduct(
  accessToken: string,
  businessId: string,
  productId: string,
): Promise<Product> {
  return apiRequest<Product>(
    productsPath(businessId, `/${productId}/restore`),
    {
      method: "PATCH",
      accessToken,
    },
  );
}
