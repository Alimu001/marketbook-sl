import { apiRequest, apiRequestPaginated } from "./client";
import { businessScopedPath } from "./businesses";
import type { PaymentMethod } from "@/sales/types";

export interface SupplierReturnItemInput {
  purchaseItemId: string;
  quantity: string;
}

export interface CreateSupplierReturnPayload {
  items: SupplierReturnItemInput[];
  reason: string;
  notes?: string;
  refundPaymentMethod?: PaymentMethod;
}

export interface SupplierReturnItemDetail {
  id: string;
  purchaseItemId: string;
  productId: string;
  quantity: string;
  unitCostSnapshot: string;
  lineReturnAmount: string;
  createdAt: string;
}

export interface SupplierReturnDetail {
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
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
  items: SupplierReturnItemDetail[];
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

export interface SupplierReturnListItem {
  id: string;
  returnNumber: string;
  purchaseId: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  returnAmount: string;
  reason: string;
  createdAt: string;
}

function purchasePath(
  businessId: string,
  purchaseId: string,
  suffix = "",
): string {
  return `${businessScopedPath(businessId)}/purchases/${purchaseId}${suffix}`;
}

function supplierReturnsPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/supplier-returns${suffix}`;
}

export function getPurchaseReturnSummary(
  accessToken: string,
  businessId: string,
  purchaseId: string,
): Promise<PurchaseReturnSummary> {
  return apiRequest<PurchaseReturnSummary>(
    purchasePath(businessId, purchaseId, "/return-summary"),
    { method: "GET", accessToken },
  );
}

export function createSupplierReturn(
  accessToken: string,
  businessId: string,
  purchaseId: string,
  input: CreateSupplierReturnPayload,
): Promise<{ supplierReturn: SupplierReturnDetail }> {
  return apiRequest<{ supplierReturn: SupplierReturnDetail }>(
    purchasePath(businessId, purchaseId, "/returns"),
    { method: "POST", accessToken, body: input },
  );
}

export function listPurchaseReturns(
  accessToken: string,
  businessId: string,
  purchaseId: string,
): Promise<{ returns: SupplierReturnDetail[] }> {
  return apiRequest<{ returns: SupplierReturnDetail[] }>(
    purchasePath(businessId, purchaseId, "/returns"),
    { method: "GET", accessToken },
  );
}

export function listSupplierReturns(
  accessToken: string,
  businessId: string,
  page = 1,
  limit = 20,
): Promise<import("./errors").PaginatedResponse<SupplierReturnListItem[]>> {
  return apiRequestPaginated<SupplierReturnListItem[]>(
    `${supplierReturnsPath(businessId)}?page=${page}&limit=${limit}`,
    { method: "GET", accessToken },
  );
}

export function getSupplierReturnDetail(
  accessToken: string,
  businessId: string,
  returnId: string,
): Promise<{ supplierReturn: SupplierReturnDetail }> {
  return apiRequest<{ supplierReturn: SupplierReturnDetail }>(
    supplierReturnsPath(businessId, `/${returnId}`),
    { method: "GET", accessToken },
  );
}
