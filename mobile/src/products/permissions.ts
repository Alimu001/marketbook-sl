import type { BusinessRole } from "@/api/businesses";

export function canCreateProduct(role: BusinessRole): boolean {
  return role === "owner" || role === "admin" || role === "staff";
}

export function canEditProduct(role: BusinessRole): boolean {
  return canCreateProduct(role);
}

export function canArchiveProduct(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}

export function canRestoreProduct(role: BusinessRole): boolean {
  return canArchiveProduct(role);
}

export function canViewProduct(_role: BusinessRole): boolean {
  return true;
}
