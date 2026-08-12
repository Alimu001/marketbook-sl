export type PaymentProvider = "MOCK" | "ORANGE_MONEY" | "AFRIMONEY";

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type PaymentSource = "MANUAL" | "PROVIDER";

export interface PaymentUserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface PaymentSaleSummary {
  id: string;
  receiptNumber: string;
}

export interface PaymentListItem {
  id: string;
  merchantReference: string;
  provider: PaymentProvider;
  amount: string;
  totalAmount: string;
  walletAmount: string;
  status: PaymentStatus;
  phoneNumberMasked: string | null;
  providerReferenceMasked: string | null;
  sale: PaymentSaleSummary | null;
  initiatedBy: PaymentUserSummary;
  createdAt: string;
  confirmedAt: string | null;
}

export interface PaymentDetailResponse {
  id: string;
  businessId: string;
  merchantReference: string;
  provider: PaymentProvider;
  amount: string;
  totalAmount: string;
  walletAmount: string;
  discountAmount: string;
  currency: string;
  status: PaymentStatus;
  phoneNumberMasked: string | null;
  providerReferenceMasked: string | null;
  paymentUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  sale: PaymentSaleSummary | null;
  initiatedBy: PaymentUserSummary;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  failedAt: string | null;
  expiresAt: string | null;
}

export interface InitiatePaymentResponse {
  payment: PaymentDetailResponse;
}

export interface PaymentProvidersResponse {
  providers: Array<{
    provider: "MOCK" | "ORANGE_MONEY";
    label: string;
  }>;
}

export interface PaymentsReportResponse {
  period: { from: string | null; to: string | null };
  totals: {
    succeededAmount: string;
    succeededCount: number;
    pendingCount: number;
    failedCount: number;
    expiredCount: number;
  };
  byProvider: Array<{
    provider: PaymentProvider;
    succeededAmount: string;
    succeededCount: number;
    pendingCount: number;
    failedCount: number;
  }>;
}

export interface PaymentsListResponse {
  items: PaymentListItem[];
  page: number;
  limit: number;
  total: number;
}
