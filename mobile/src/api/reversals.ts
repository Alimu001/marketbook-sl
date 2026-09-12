import { apiRequest } from "./client";
import { businessScopedPath } from "./businesses";
import type { PaymentMethod } from "@/sales/types";

export interface SaleRefundItemInput {
  saleItemId: string;
  quantity: string;
  restock: boolean;
}

export interface CreateSaleRefundPayload {
  items: SaleRefundItemInput[];
  reason: string;
  notes?: string;
  refundDestination?: import("@/api/wallet").RefundDestination;
  refundPaymentMethod?: PaymentMethod;
}

export interface SaleRefundItemDetail {
  id: string;
  saleItemId: string;
  productId: string;
  quantity: string;
  unitPriceSnapshot: string;
  costPriceSnapshot: string;
  lineRefundAmount: string;
  restock: boolean;
  createdAt: string;
}

export interface SaleRefundDetail {
  id: string;
  businessId: string;
  saleId: string;
  refundNumber: string;
  refundAmount: string;
  receivableReduction: string;
  cashReturnAmount: string;
  walletCreditAmount: string;
  refundDestination: import("@/api/wallet").RefundDestination | null;
  refundPaymentMethod: PaymentMethod | null;
  reason: string;
  notes: string | null;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
  items: SaleRefundItemDetail[];
  createdAt: string;
}

export interface SaleItemRefundableSummary {
  saleItemId: string;
  productId: string;
  productNameSnapshot: string;
  soldQuantity: string;
  refundedQuantity: string;
  refundableQuantity: string;
  unitPrice: string;
  estimatedLineRefundPerUnit: string;
}

export interface SaleReversalSummary {
  refundedAmount: string;
  remainingRefundableAmount: string;
  isFullyRefunded: boolean;
  refunds: Array<{
    id: string;
    refundNumber: string;
    refundAmount: string;
    reason: string;
    createdAt: string;
  }>;
  items: SaleItemRefundableSummary[];
}

export interface VoidPayload {
  reason: string;
  notes?: string;
}

function salePath(businessId: string, saleId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/sales/${saleId}${suffix}`;
}

function purchasePath(
  businessId: string,
  purchaseId: string,
  suffix = "",
): string {
  return `${businessScopedPath(businessId)}/purchases/${purchaseId}${suffix}`;
}

function refundsPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/refunds${suffix}`;
}

export function getSaleReversalSummary(
  accessToken: string,
  businessId: string,
  saleId: string,
): Promise<SaleReversalSummary> {
  return apiRequest<SaleReversalSummary>(
    salePath(businessId, saleId, "/reversal-summary"),
    { method: "GET", accessToken },
  );
}

export function createSaleRefund(
  accessToken: string,
  businessId: string,
  saleId: string,
  input: CreateSaleRefundPayload,
): Promise<{ refund: SaleRefundDetail }> {
  return apiRequest<{ refund: SaleRefundDetail }>(
    salePath(businessId, saleId, "/refunds"),
    { method: "POST", accessToken, body: input },
  );
}

export function listSaleRefunds(
  accessToken: string,
  businessId: string,
  saleId: string,
): Promise<{ refunds: SaleRefundDetail[] }> {
  return apiRequest<{ refunds: SaleRefundDetail[] }>(
    salePath(businessId, saleId, "/refunds"),
    { method: "GET", accessToken },
  );
}

export function getRefundDetail(
  accessToken: string,
  businessId: string,
  refundId: string,
): Promise<{ refund: SaleRefundDetail }> {
  return apiRequest<{ refund: SaleRefundDetail }>(
    refundsPath(businessId, `/${refundId}`),
    { method: "GET", accessToken },
  );
}

export function voidSale(
  accessToken: string,
  businessId: string,
  saleId: string,
  input: VoidPayload,
): Promise<{ void: { id: string; saleId: string; reason: string }; sale: { id: string; status: string } }> {
  return apiRequest(salePath(businessId, saleId, "/void"), {
    method: "POST",
    accessToken,
    body: input,
  });
}

export function voidPurchase(
  accessToken: string,
  businessId: string,
  purchaseId: string,
  input: VoidPayload,
): Promise<{ void: { id: string; purchaseId: string; reason: string }; purchase: { id: string; status: string } }> {
  return apiRequest(purchasePath(businessId, purchaseId, "/void"), {
    method: "POST",
    accessToken,
    body: input,
  });
}
