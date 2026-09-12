import type { BusinessRole } from "@/api/businesses";

export function canViewInventory(_role: BusinessRole): boolean {
  return true;
}

export function canInitializeOpeningStock(role: BusinessRole): boolean {
  return role === "owner" || role === "admin" || role === "staff";
}

export function canAdjustInventory(role: BusinessRole): boolean {
  return canInitializeOpeningStock(role);
}

export function canUpdateThreshold(role: BusinessRole): boolean {
  return canInitializeOpeningStock(role);
}

export function canViewInventoryHistory(_role: BusinessRole): boolean {
  return true;
}
