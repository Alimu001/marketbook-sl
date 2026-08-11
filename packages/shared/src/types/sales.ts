export type SaleStatus = "COMPLETED" | "VOIDED";

export type PaymentMethod = "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER";

export type SalePaymentStatus = "PAID" | "PARTIALLY_PAID" | "UNPAID";

export interface SaleCustomerSummary {
  id: string;
  name: string;
}

export interface SaleUserSummary {
  id: string;
  name: string | null;
  email: string;
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
  status: SaleStatus;
  customer: SaleCustomerSummary | null;
  createdBy: SaleUserSummary;
  itemCount: number;
  createdAt: string;
}

export interface SaleItemResponse {
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

export interface SaleDetailResponse {
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
  status: SaleStatus;
  notes: string | null;
  customer: SaleCustomerSummary | null;
  createdBy: SaleUserSummary;
  items: SaleItemResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSaleResponse {
  sale: SaleDetailResponse;
}
