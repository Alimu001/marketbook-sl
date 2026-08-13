export type CustomerWalletTransactionType =
  | "REFUND_CREDIT"
  | "SALE_PAYMENT"
  | "MANUAL_CREDIT"
  | "MANUAL_DEBIT";

export type RefundDestination =
  | "CASH"
  | "MOBILE_MONEY"
  | "BANK_TRANSFER"
  | "WALLET";

export interface CustomerWalletResponse {
  customerId: string;
  balance: string;
  updatedAt: string;
}

export interface WalletTransactionUserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface CustomerWalletTransactionResponse {
  id: string;
  type: CustomerWalletTransactionType;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  notes: string | null;
  createdBy: WalletTransactionUserSummary;
  createdAt: string;
}

export interface WalletHistoryResponse {
  items: CustomerWalletTransactionResponse[];
  page: number;
  limit: number;
  total: number;
}

export interface BusinessWalletListItem {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  balance: string;
  updatedAt: string;
}

export interface BusinessWalletsResponse {
  items: BusinessWalletListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface WalletsReportResponse {
  totalLiability: string;
  customerCountWithBalance: number;
  topCustomers: Array<{
    customerId: string;
    customerName: string;
    balance: string;
  }>;
}
