import type {
  PaymentMethod,
  SalePaymentStatus,
  SaleStatus,
} from "./sales.js";

export interface SaleReceiptItem {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface SaleReceiptResponse {
  version: 1;
  currency: "SLE";
  business: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  receiptNumber: string;
  saleId: string;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  paymentMethod: PaymentMethod | null;
  customerName: string | null;
  servedBy: string;
  items: SaleReceiptItem[];
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  amountPaid: string;
  walletAmountUsed: string;
  outstandingAmount: string;
  refundedAmount: string;
  notes: string | null;
  footer: string | null;
  soldAt: string;
}
