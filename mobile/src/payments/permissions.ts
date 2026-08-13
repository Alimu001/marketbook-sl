import type { BusinessRole } from "@/api/businesses";

export function canViewPayments(_role: BusinessRole): boolean {
  return true;
}

export function canReconcilePayment(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}
