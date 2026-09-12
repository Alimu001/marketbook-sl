import type { BusinessRole } from "@/api/businesses";

export function canCreateCustomer(role: BusinessRole): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "staff" ||
    role === "cashier"
  );
}

export function canViewCustomer(_role: BusinessRole): boolean {
  return true;
}

export function canEditCustomer(role: BusinessRole): boolean {
  return role === "owner" || role === "admin" || role === "staff";
}

export function canArchiveCustomer(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}

export function canRestoreCustomer(role: BusinessRole): boolean {
  return canArchiveCustomer(role);
}
