import type { BusinessRole } from "@/api/businesses";

export function canCreateSaleRefund(role: BusinessRole): boolean {
  return role === "owner" || role === "admin" || role === "staff";
}

export function canVoidSale(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}

export function canVoidPurchase(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}
