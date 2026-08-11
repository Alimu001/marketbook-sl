export type SaleStatus = "COMPLETED" | "VOIDED";

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
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  notes: string | null;
  createdBy: SaleUserSummary;
  items: SaleItemResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSaleResponse {
  sale: SaleDetailResponse;
}
