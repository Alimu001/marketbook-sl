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
export const salesHref = "/(app)/sales" as Href;
export const saleNewHref = "/(app)/sales/new" as Href;
export const customersHref = "/(app)/customers" as Href;
export const customerCreateHref = "/(app)/customers/create" as Href;
export const customerSelectHref = "/(app)/customers/select" as Href;
export const debtsHref = "/(app)/debts" as Href;

export function saleDetailHref(saleId: string): Href {
  return `/(app)/sales/${saleId}` as Href;
}

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

export function customerDetailHref(customerId: string): Href {
  return `/(app)/customers/${customerId}` as Href;
}

export function debtDetailHref(debtId: string): Href {
  return `/(app)/debts/${debtId}` as Href;
}

export function debtPayHref(debtId: string): Href {
  return `/(app)/debts/pay/${debtId}` as Href;
}

export const loginWithRegisteredHref = {
  pathname: "/(auth)/login",
  params: { registered: "1" },
} as unknown as Href;
