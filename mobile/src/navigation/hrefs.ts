import type { Href } from "expo-router";

export const homeHref = "/" as Href;
export const loginHref = "/(auth)/login" as Href;
export const registerHref = "/(auth)/register" as Href;
export const appHref = "/(app)" as Href;
export const businessCreateHref = "/(app)/business/create" as Href;
export const businessSelectHref = "/(app)/business/select" as Href;
export const productsHref = "/(app)/products" as Href;
export const productCreateHref = "/(app)/products/create" as Href;
export const inventoryHref = "/(app)/inventory" as Href;

export function productDetailHref(productId: string): Href {
  return `/(app)/products/${productId}` as Href;
}

export function inventoryDetailHref(productId: string): Href {
  return `/(app)/inventory/${productId}` as Href;
}

export function inventoryOpeningHref(productId: string): Href {
  return `/(app)/inventory/opening/${productId}` as Href;
}

export function inventoryAdjustHref(productId: string): Href {
  return `/(app)/inventory/adjust/${productId}` as Href;
}

export function inventoryHistoryHref(productId: string): Href {
  return `/(app)/inventory/history/${productId}` as Href;
}

export function inventoryThresholdHref(productId: string): Href {
  return `/(app)/inventory/threshold/${productId}` as Href;
}

export const loginWithRegisteredHref = {
  pathname: "/(auth)/login",
  params: { registered: "1" },
} as unknown as Href;
