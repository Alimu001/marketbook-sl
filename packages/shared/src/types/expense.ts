export interface ExpenseCategorySummary {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseUserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface ExpenseCategoryRef {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ExpenseListItem {
  id: string;
  amount: string;
  category: ExpenseCategoryRef;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER";
  expenseDate: string;
  vendorOrPayee: string | null;
  description: string;
  isArchived: boolean;
  recordedBy: ExpenseUserSummary;
  createdAt: string;
}

export interface ExpenseDetail {
  id: string;
  businessId: string;
  amount: string;
  category: ExpenseCategoryRef;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER";
  expenseDate: string;
  vendorOrPayee: string | null;
  referenceNumber: string | null;
  description: string;
  notes: string | null;
  isArchived: boolean;
  recordedBy: ExpenseUserSummary;
  createdAt: string;
  updatedAt: string;
}
