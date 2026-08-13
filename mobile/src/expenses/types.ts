import type { BusinessRole } from "@/api/businesses";
import type { PaymentMethod } from "@/sales/types";

export type ExpenseCategorySummary = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseCategoryRef = {
  id: string;
  name: string;
  isActive: boolean;
};

export type ExpenseUserSummary = {
  id: string;
  name: string | null;
  email: string;
};

export type ExpenseListItem = {
  id: string;
  amount: string;
  category: ExpenseCategoryRef;
  paymentMethod: PaymentMethod;
  expenseDate: string;
  vendorOrPayee: string | null;
  description: string;
  isArchived: boolean;
  recordedBy: ExpenseUserSummary;
  createdAt: string;
};

export type ExpenseDetail = {
  id: string;
  businessId: string;
  amount: string;
  category: ExpenseCategoryRef;
  paymentMethod: PaymentMethod;
  expenseDate: string;
  vendorOrPayee: string | null;
  referenceNumber: string | null;
  description: string;
  notes: string | null;
  isArchived: boolean;
  recordedBy: ExpenseUserSummary;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseFilter = "active" | "archived" | "all";

export type ListExpensesParams = {
  page?: number;
  limit?: number;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
  from?: string;
  to?: string;
  search?: string;
  isArchived?: boolean;
};

export type ListExpenseCategoriesParams = {
  isActive?: boolean;
};

export type CreateExpensePayload = {
  categoryId: string;
  amount: string;
  paymentMethod: PaymentMethod;
  expenseDate: string;
  vendorOrPayee?: string;
  referenceNumber?: string;
  description: string;
  notes?: string;
};

export type UpdateExpensePayload = Partial<CreateExpensePayload>;

export type CreateExpenseCategoryPayload = {
  name: string;
  description?: string;
};

export type UpdateExpenseCategoryPayload = {
  name?: string;
  description?: string;
};

export function formatExpenseDateDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) {
    return value;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatExpenseDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
