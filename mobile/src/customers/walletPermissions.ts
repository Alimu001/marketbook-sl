import type { BusinessRole } from "@/api/businesses";

export function canViewWallet(_role: BusinessRole): boolean {
  return true;
}

export function canManualAdjustWallet(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}

export function canUseWalletOnSale(_role: BusinessRole): boolean {
  return true;
}
