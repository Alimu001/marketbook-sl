export type PaymentMethod = "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER";

export interface SaleUserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface SaleListItem {
  id: string;
  receiptNumber: string;
  totalAmount: string;
  paymentMethod: PaymentMethod;
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
  paymentMethod: PaymentMethod;
  status: "COMPLETED" | "VOIDED";
  notes: string | null;
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
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface ListSalesParams {
  page?: number;
  limit?: number;
  paymentMethod?: PaymentMethod;
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

export function formatPaymentMethod(method: PaymentMethod): string {
  return PAYMENT_METHODS.find((entry) => entry.value === method)?.label ?? method;
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
