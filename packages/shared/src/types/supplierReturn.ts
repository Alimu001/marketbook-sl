import type { PaymentMethod } from "./sales.js";

export interface SupplierReturnItemResponse {
  id: string;
  purchaseItemId: string;
  productId: string;
  quantity: string;
  unitCostSnapshot: string;
  lineReturnAmount: string;
  createdAt: string;
}

export interface SupplierReturnUserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface SupplierReturnResponse {
  id: string;
  businessId: string;
  purchaseId: string;
  supplierId: string;
  returnNumber: string;
  returnAmount: string;
  payableReduction: string;
  cashRefundAmount: string;
  refundPaymentMethod: PaymentMethod | null;
  reason: string;
  notes: string | null;
  createdBy: SupplierReturnUserSummary;
  items: SupplierReturnItemResponse[];
  createdAt: string;
}

export interface CreateSupplierReturnResponse {
  supplierReturn: SupplierReturnResponse;
}

export interface SupplierReturnListItem {
  id: string;
  returnNumber: string;
  purchaseId: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  returnAmount: string;
  reason: string;
  createdBy: SupplierReturnUserSummary;
  createdAt: string;
}

export interface PurchaseItemReturnableSummary {
  purchaseItemId: string;
  productId: string;
  productNameSnapshot: string;
  purchasedQuantity: string;
  returnedQuantity: string;
  returnableQuantity: string;
  currentStock: string;
  maxReturnableNow: string;
  unitCost: string;
  estimatedLineReturnPerUnit: string;
}

export interface PurchaseReturnSummary {
  returnedAmount: string;
  effectivePurchaseTotal: string;
  remainingReturnableAmount: string;
  returns: Array<{
    id: string;
    returnNumber: string;
    returnAmount: string;
    reason: string;
    createdAt: string;
  }>;
  items: PurchaseItemReturnableSummary[];
}
