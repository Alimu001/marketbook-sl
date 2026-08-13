export type DebtStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "VOIDED";

export type SalePaymentStatus = "PAID" | "PARTIALLY_PAID" | "UNPAID";

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

export interface DebtPaymentResponse {
  id: string;
  amount: string;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER";
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
  payment: DebtPaymentResponse;
  debt: CustomerDebtSummary;
}

export interface CustomerHistoryResponse {
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
  payments: Array<DebtPaymentResponse & { receiptNumber: string }>;
}
