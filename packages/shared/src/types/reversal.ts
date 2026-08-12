import type { PaymentMethod } from "./sales.js";
import type { PurchaseStatus } from "./supplier.js";

export interface SaleRefundItemResponse {
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

export interface SaleRefundUserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface SaleRefundResponse {
  id: string;
  businessId: string;
  saleId: string;
  refundNumber: string;
  refundAmount: string;
  receivableReduction: string;
  cashReturnAmount: string;
  refundPaymentMethod: PaymentMethod | null;
  reason: string;
  notes: string | null;
  createdBy: SaleRefundUserSummary;
  items: SaleRefundItemResponse[];
  createdAt: string;
}

export interface CreateSaleRefundResponse {
  refund: SaleRefundResponse;
}

export interface SaleRefundListItem {
  id: string;
  refundNumber: string;
  saleId: string;
  receiptNumber: string;
  refundAmount: string;
  reason: string;
  createdBy: SaleRefundUserSummary;
  createdAt: string;
}

export interface SaleRefundSummaryForSale {
  id: string;
  refundNumber: string;
  refundAmount: string;
  reason: string;
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
  refunds: SaleRefundSummaryForSale[];
  items: SaleItemRefundableSummary[];
}

export interface SaleVoidResponse {
  id: string;
  businessId: string;
  saleId: string;
  reason: string;
  notes: string | null;
  createdBy: SaleRefundUserSummary;
  createdAt: string;
}

export interface CreateSaleVoidResponse {
  void: SaleVoidResponse;
  sale: {
    id: string;
    status: "VOIDED";
    receiptNumber: string;
  };
}

export interface PurchaseVoidResponse {
  id: string;
  businessId: string;
  purchaseId: string;
  reason: string;
  notes: string | null;
  createdBy: SaleRefundUserSummary;
  createdAt: string;
}

export interface CreatePurchaseVoidResponse {
  void: PurchaseVoidResponse;
  purchase: {
    id: string;
    status: PurchaseStatus;
    purchaseNumber: string;
  };
}
