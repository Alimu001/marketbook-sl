import type { BusinessRole } from "@/api/businesses";

export function canCreateSupplierReturn(role: BusinessRole): boolean {
  return role === "owner" || role === "admin" || role === "staff";
}
