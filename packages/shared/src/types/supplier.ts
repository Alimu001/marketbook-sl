export type PayableStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "VOIDED";

export type PurchasePaymentStatus = "PAID" | "PARTIALLY_PAID" | "UNPAID";

export type PurchaseStatus = "COMPLETED" | "VOIDED";

export interface SupplierSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  outstandingBalance: string;
  createdAt: string;
}

export interface SupplierDetail {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  outstandingBalance: string;
  openPayableCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPayableSummary {
  id: string;
  purchaseId: string;
  purchaseNumber: string;
  originalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  status: PayableStatus;
  createdAt: string;
}

export interface BusinessPayableListItem {
  id: string;
  supplier: {
    id: string;
    name: string;
    phone: string | null;
  };
  purchaseId: string;
  purchaseNumber: string;
  originalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  status: PayableStatus;
  createdAt: string;
}

export interface SupplierPaymentResponse {
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

export interface RecordSupplierPaymentResponse {
  payment: SupplierPaymentResponse;
  payable: SupplierPayableSummary;
}

export interface SupplierHistoryResponse {
  purchases: Array<{
    id: string;
    purchaseNumber: string;
    totalAmount: string;
    amountPaid: string;
    outstandingAmount: string;
    paymentStatus: PurchasePaymentStatus;
    createdAt: string;
  }>;
  payables: SupplierPayableSummary[];
  payments: Array<SupplierPaymentResponse & { purchaseNumber: string }>;
}

export interface PurchaseSupplierSummary {
  id: string;
  name: string;
}

export interface PurchaseUserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface PurchaseListItem {
  id: string;
  purchaseNumber: string;
  supplier: PurchaseSupplierSummary;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  paymentStatus: PurchasePaymentStatus;
  status: PurchaseStatus;
  itemCount: number;
  createdBy: PurchaseUserSummary;
  createdAt: string;
}

export interface PurchaseItemResponse {
  id: string;
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string | null;
  unitSnapshot: string;
  quantity: string;
  unitCost: string;
  lineSubtotal: string;
  createdAt: string;
}

export interface PurchaseDetailResponse {
  id: string;
  businessId: string;
  purchaseNumber: string;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  paymentStatus: PurchasePaymentStatus;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER" | null;
  status: PurchaseStatus;
  notes: string | null;
  supplier: PurchaseSupplierSummary;
  createdBy: PurchaseUserSummary;
  items: PurchaseItemResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseResponse {
  purchase: PurchaseDetailResponse;
}
