import type { BusinessRole } from "@/api/businesses";

export function canCreateExpense(role: BusinessRole): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "staff" ||
    role === "cashier"
  );
}

export function canViewExpense(_role: BusinessRole): boolean {
  return true;
}

export function canEditExpense(role: BusinessRole): boolean {
  return role === "owner" || role === "admin" || role === "staff";
}

export function canArchiveExpense(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}

export function canRestoreExpense(role: BusinessRole): boolean {
  return canArchiveExpense(role);
}

export function canManageExpenseCategories(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}
