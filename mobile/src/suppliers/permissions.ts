import type { BusinessRole } from "@/api/businesses";

export function canCreateSupplier(role: BusinessRole): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "staff" ||
    role === "cashier"
  );
}

export function canViewSupplier(_role: BusinessRole): boolean {
  return true;
}

export function canEditSupplier(role: BusinessRole): boolean {
  return role === "owner" || role === "admin" || role === "staff";
}

export function canArchiveSupplier(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}

export function canRestoreSupplier(role: BusinessRole): boolean {
  return canArchiveSupplier(role);
}
