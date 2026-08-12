import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type { PaginatedResponse } from "./errors";

export type WalletTransactionType =
  | "REFUND_CREDIT"
  | "SALE_PAYMENT"
  | "MANUAL_CREDIT"
  | "MANUAL_DEBIT";

export type RefundDestination =
  | "CASH"
  | "MOBILE_MONEY"
  | "BANK_TRANSFER"
  | "WALLET";

export interface CustomerWallet {
  customerId: string;
  balance: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  notes: string | null;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
  createdAt: string;
}

export interface WalletsReport {
  totalLiability: string;
  customerCountWithBalance: number;
  topCustomers: Array<{
    customerId: string;
    customerName: string;
    balance: string;
  }>;
}

function walletPath(businessId: string, customerId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/customers/${customerId}/wallet${suffix}`;
}

export function getCustomerWallet(
  accessToken: string,
  businessId: string,
  customerId: string,
): Promise<CustomerWallet> {
  return apiRequest<CustomerWallet>(walletPath(businessId, customerId), {
    method: "GET",
    accessToken,
  });
}

export function getWalletHistory(
  accessToken: string,
  businessId: string,
  customerId: string,
  params: { page?: number; limit?: number; type?: WalletTransactionType } = {},
): Promise<PaginatedResponse<WalletTransaction[]>> {
  const searchParams = new URLSearchParams();
  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }
  searchParams.set("limit", String(params.limit ?? 20));
  if (params.type) {
    searchParams.set("type", params.type);
  }
  const query = searchParams.toString();

  return apiRequestPaginated<WalletTransaction[]>(
    `${walletPath(businessId, customerId, "/history")}${query ? `?${query}` : ""}`,
    { method: "GET", accessToken },
  );
}

export function manualCreditWallet(
  accessToken: string,
  businessId: string,
  customerId: string,
  input: { amount: string; reason: string; notes?: string },
): Promise<CustomerWallet> {
  return apiRequest<CustomerWallet>(walletPath(businessId, customerId, "/credit"), {
    method: "POST",
    accessToken,
    body: input,
  });
}

export function manualDebitWallet(
  accessToken: string,
  businessId: string,
  customerId: string,
  input: { amount: string; reason: string; notes?: string },
): Promise<CustomerWallet> {
  return apiRequest<CustomerWallet>(walletPath(businessId, customerId, "/debit"), {
    method: "POST",
    accessToken,
    body: input,
  });
}

export function getWalletsReport(
  accessToken: string,
  businessId: string,
): Promise<WalletsReport> {
  return apiRequest<WalletsReport>(
    `${businessScopedPath(businessId)}/reports/wallets`,
    { method: "GET", accessToken },
  );
}

export const WALLET_TRANSACTION_LABELS: Record<WalletTransactionType, string> = {
  REFUND_CREDIT: "Refund Credit",
  SALE_PAYMENT: "Sale Payment",
  MANUAL_CREDIT: "Manual Credit",
  MANUAL_DEBIT: "Manual Debit",
};

export const REFUND_DESTINATIONS: Array<{ value: RefundDestination; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "WALLET", label: "Store Credit" },
];
