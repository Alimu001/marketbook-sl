import type { PaymentMethod } from "@/sales/types";

export type PayableStatus = "OPEN" | "PARTIALLY_PAID" | "PAID";

export type PurchasePaymentStatus = "PAID" | "PARTIALLY_PAID" | "UNPAID";

export type SupplierFilter = "active" | "archived" | "all";

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

export interface SupplierPayment {
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

export interface RecordSupplierPaymentResponse {
  payment: SupplierPayment;
  payable: SupplierPayableSummary;
}

export interface SupplierHistory {
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
  payments: Array<SupplierPayment & { purchaseNumber: string }>;
}

export interface CreateSupplierPayload {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface UpdateSupplierPayload {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface ListSuppliersParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  hasPayable?: boolean;
}

export interface ListBusinessPayablesParams {
  page?: number;
  limit?: number;
  status?: PayableStatus;
  search?: string;
  supplierId?: string;
}

export interface ListSupplierPayablesParams {
  page?: number;
  limit?: number;
  status?: PayableStatus;
}

export interface RecordSupplierPaymentPayload {
  amount: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface ListSupplierPaymentsParams {
  page?: number;
  limit?: number;
}

export interface PosSupplierSelection {
  id: string;
  name: string;
  phone: string | null;
}

export interface SupplierSummaryRef {
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
  supplier: SupplierSummaryRef;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  paymentStatus: PurchasePaymentStatus;
  itemCount: number;
  createdBy: PurchaseUserSummary;
  createdAt: string;
}

export interface PurchaseItem {
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

export interface PurchaseDetail {
  id: string;
  businessId: string;
  purchaseNumber: string;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  paymentStatus: PurchasePaymentStatus;
  status: "COMPLETED" | "VOIDED";
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  supplier: SupplierSummaryRef;
  createdBy: PurchaseUserSummary;
  items: PurchaseItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchasePayload {
  supplierId: string;
  items: Array<{
    productId: string;
    quantity: string;
    unitCost: string;
  }>;
  discountAmount?: string;
  amountPaid?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export interface ListPurchasesParams {
  page?: number;
  limit?: number;
  supplierId?: string;
  paymentStatus?: PurchasePaymentStatus;
  from?: string;
  to?: string;
}

export interface PurchaseCartItem {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  unitCost: string;
  quantity: string;
}

export const PAYABLE_STATUSES: Array<{ value: PayableStatus; label: string }> =
  [
    { value: "OPEN", label: "Open" },
    { value: "PARTIALLY_PAID", label: "Partially Paid" },
    { value: "PAID", label: "Paid" },
  ];

export const PURCHASE_PAYMENT_STATUSES: Array<{
  value: PurchasePaymentStatus;
  label: string;
}> = [
  { value: "PAID", label: "Paid" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "UNPAID", label: "Unpaid" },
];

export function formatPayableStatus(status: PayableStatus): string {
  return (
    PAYABLE_STATUSES.find((entry) => entry.value === status)?.label ?? status
  );
}

export function formatPurchasePaymentStatus(
  status: PurchasePaymentStatus,
): string {
  return (
    PURCHASE_PAYMENT_STATUSES.find((entry) => entry.value === status)?.label ??
    status
  );
}

export function formatSupplierDateTime(isoDate: string): string {
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
