import { apiRequest } from "./client";
import { businessScopedPath } from "./businesses";

export type PaymentProvider = "MOCK" | "ORANGE_MONEY" | "AFRIMONEY";

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

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

export interface PaymentDetail {
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

export interface PaymentProvidersResponse {
  providers: Array<{
    provider: "MOCK" | "ORANGE_MONEY";
    label: string;
  }>;
}

export interface InitiatePaymentPayload {
  provider: "MOCK" | "ORANGE_MONEY";
  phoneNumber?: string;
  idempotencyKey?: string;
  sale: {
    items: Array<{
      productId: string;
      quantity: string;
    }>;
    discountAmount?: string;
    customerId?: string;
    walletAmount?: string;
    notes?: string;
  };
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

export interface ListPaymentsParams {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
  provider?: PaymentProvider;
  from?: string;
  to?: string;
}

export interface PaymentsListResponse {
  items: PaymentListItem[];
  page: number;
  limit: number;
  total: number;
}

function paymentsPath(businessId: string, suffix = ""): string {
  return `${businessScopedPath(businessId)}/payments${suffix}`;
}

function buildListQuery(params: ListPaymentsParams = {}): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }

  searchParams.set("limit", String(params.limit ?? 20));

  if (params.status) {
    searchParams.set("status", params.status);
  }

  if (params.provider) {
    searchParams.set("provider", params.provider);
  }

  if (params.from) {
    searchParams.set("from", params.from);
  }

  if (params.to) {
    searchParams.set("to", params.to);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function listPaymentProviders(
  accessToken: string,
  businessId: string,
): Promise<PaymentProvidersResponse> {
  return apiRequest<PaymentProvidersResponse>(
    paymentsPath(businessId, "/providers"),
    {
      method: "GET",
      accessToken,
    },
  );
}

export function initiatePayment(
  accessToken: string,
  businessId: string,
  payload: InitiatePaymentPayload,
): Promise<PaymentDetail> {
  return apiRequest<PaymentDetail>(paymentsPath(businessId), {
    method: "POST",
    accessToken,
    body: payload,
  });
}

export function getPayment(
  accessToken: string,
  businessId: string,
  paymentId: string,
): Promise<PaymentDetail> {
  return apiRequest<PaymentDetail>(paymentsPath(businessId, `/${paymentId}`), {
    method: "GET",
    accessToken,
  });
}

export function listPayments(
  accessToken: string,
  businessId: string,
  params: ListPaymentsParams = {},
): Promise<PaymentsListResponse> {
  return apiRequest<PaymentsListResponse>(
    `${paymentsPath(businessId)}${buildListQuery(params)}`,
    {
      method: "GET",
      accessToken,
    },
  );
}

export function reconcilePayment(
  accessToken: string,
  businessId: string,
  paymentId: string,
): Promise<PaymentDetail> {
  return apiRequest<PaymentDetail>(
    paymentsPath(businessId, `/${paymentId}/reconcile`),
    {
      method: "POST",
      accessToken,
    },
  );
}

function reportsPaymentsPath(businessId: string, query = ""): string {
  return `${businessScopedPath(businessId)}/reports/payments${query}`;
}

export function getPaymentsReport(
  accessToken: string,
  businessId: string,
  params: { from?: string; to?: string } = {},
): Promise<PaymentsReportResponse> {
  const searchParams = new URLSearchParams();
  if (params.from) {
    searchParams.set("from", params.from);
  }
  if (params.to) {
    searchParams.set("to", params.to);
  }
  const query = searchParams.toString();
  return apiRequest<PaymentsReportResponse>(
    reportsPaymentsPath(businessId, query ? `?${query}` : ""),
    {
      method: "GET",
      accessToken,
    },
  );
}
