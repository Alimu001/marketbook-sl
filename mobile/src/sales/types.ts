export type PaymentMethod = "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER";

export type SalePaymentStatus = "PAID" | "PARTIALLY_PAID" | "UNPAID";

export interface SaleUserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface SaleCustomerSummary {
  id: string;
  name: string;
}

export interface SaleListItem {
  id: string;
  receiptNumber: string;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  refundedAmount: string;
  paymentStatus: SalePaymentStatus;
  paymentMethod: PaymentMethod | null;
  status: "COMPLETED" | "VOIDED";
  customer: SaleCustomerSummary | null;
  createdBy: SaleUserSummary;
  itemCount: number;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string | null;
  unitSnapshot: string;
  quantity: string;
  unitPrice: string;
  costPriceSnapshot: string;
  lineSubtotal: string;
  createdAt: string;
}

export interface SaleDetail {
  id: string;
  businessId: string;
  receiptNumber: string;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  amountPaid: string;
  outstandingAmount: string;
  refundedAmount: string;
  remainingRefundableAmount: string;
  paymentStatus: SalePaymentStatus;
  paymentMethod: PaymentMethod | null;
  status: "COMPLETED" | "VOIDED";
  notes: string | null;
  customer: SaleCustomerSummary | null;
  createdBy: SaleUserSummary;
  items: SaleItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSalePayload {
  items: Array<{
    productId: string;
    quantity: string;
  }>;
  discountAmount?: string;
  customerId?: string;
  amountPaid?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export interface ListSalesParams {
  page?: number;
  limit?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: SalePaymentStatus;
  from?: string;
  to?: string;
}

export interface CartItem {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  unitPrice: string;
  quantity: string;
  availableStock: string;
}

export const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
];

export const SALE_PAYMENT_STATUSES: Array<{
  value: SalePaymentStatus;
  label: string;
}> = [
  { value: "PAID", label: "Paid" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "UNPAID", label: "Unpaid" },
];

export function formatPaymentMethod(method: PaymentMethod | null): string {
  if (!method) {
    return "—";
  }

  return PAYMENT_METHODS.find((entry) => entry.value === method)?.label ?? method;
}

export function formatSalePaymentStatus(status: SalePaymentStatus): string {
  return (
    SALE_PAYMENT_STATUSES.find((entry) => entry.value === status)?.label ??
    status
  );
}

export function formatSaleDateTime(isoDate: string): string {
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
