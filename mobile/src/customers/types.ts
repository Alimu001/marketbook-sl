import type { PaymentMethod } from "@/sales/types";

export type DebtStatus = "OPEN" | "PARTIALLY_PAID" | "PAID";

export type SalePaymentStatus = "PAID" | "PARTIALLY_PAID" | "UNPAID";

export type CustomerFilter = "active" | "archived" | "all";

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  outstandingBalance: string;
  walletBalance: string;
  createdAt: string;
}

export interface CustomerDetail {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  outstandingBalance: string;
  walletBalance: string;
  openDebtCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDebtSummary {
  id: string;
  saleId: string;
  receiptNumber: string;
  originalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  status: DebtStatus;
  createdAt: string;
}

export interface BusinessDebtListItem {
  id: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
  };
  saleId: string;
  receiptNumber: string;
  originalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  status: DebtStatus;
  createdAt: string;
}

export interface DebtPayment {
  id: string;
  amount: string;
  paymentMethod: PaymentMethod;
  balanceBefore: string;
  balanceAfter: string;
  notes: string | null;
  recordedBy: {
    id: string;
    name: string | null;
    email: string;
  };
  createdAt: string;
}

export interface RecordDebtPaymentResponse {
  payment: DebtPayment;
  debt: CustomerDebtSummary;
}

export interface CustomerHistory {
  sales: Array<{
    id: string;
    receiptNumber: string;
    totalAmount: string;
    amountPaid: string;
    outstandingAmount: string;
    paymentStatus: SalePaymentStatus;
    createdAt: string;
  }>;
  debts: CustomerDebtSummary[];
  payments: Array<DebtPayment & { receiptNumber: string }>;
}

export interface CreateCustomerPayload {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface UpdateCustomerPayload {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface ListCustomersParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  hasDebt?: boolean;
}

export interface ListBusinessDebtsParams {
  page?: number;
  limit?: number;
  status?: DebtStatus;
  search?: string;
  customerId?: string;
}

export interface ListCustomerDebtsParams {
  page?: number;
  limit?: number;
  status?: DebtStatus;
}

export interface RecordDebtPaymentPayload {
  amount: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface ListDebtPaymentsParams {
  page?: number;
  limit?: number;
}

export interface PosCustomerSelection {
  id: string;
  name: string;
  phone: string | null;
}

export const DEBT_STATUSES: Array<{ value: DebtStatus; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
];

export const SALE_PAYMENT_STATUSES: Array<{
  value: SalePaymentStatus;
  label: string;
}> = [
  { value: "PAID", label: "Paid" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "UNPAID", label: "Unpaid" },
];

export function formatDebtStatus(status: DebtStatus): string {
  return DEBT_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

export function formatSalePaymentStatus(status: SalePaymentStatus): string {
  return (
    SALE_PAYMENT_STATUSES.find((entry) => entry.value === status)?.label ??
    status
  );
}

export function formatCustomerDateTime(isoDate: string): string {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
