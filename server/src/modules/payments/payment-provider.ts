import type { PaymentProvider, PaymentStatus } from "../../../generated/prisma/client.js";

export type NormalizedProviderStatus =
  | "CREATED"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export interface CreateProviderPaymentInput {
  merchantReference: string;
  amount: string;
  currency: string;
  phoneNumber?: string;
  description?: string;
  returnUrl?: string;
  cancelUrl?: string;
  callbackUrl?: string;
}

export interface ProviderPaymentResult {
  providerTransactionId?: string;
  payToken?: string;
  notifToken?: string;
  paymentUrl?: string;
  providerStatus: string;
  normalizedStatus: NormalizedProviderStatus;
  rawResponse?: Record<string, unknown>;
}

export interface ProviderStatusResult {
  providerTransactionId?: string;
  providerStatus: string;
  normalizedStatus: NormalizedProviderStatus;
  rawResponse?: Record<string, unknown>;
}

export interface ProviderCallbackPayload {
  status?: string;
  notif_token?: string;
  notifToken?: string;
  txnid?: string;
  txnId?: string;
  [key: string]: unknown;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  createPayment(input: CreateProviderPaymentInput): Promise<ProviderPaymentResult>;
  getPaymentStatus(input: {
    merchantReference: string;
    amount: string;
    payToken?: string | null;
    providerTransactionId?: string | null;
  }): Promise<ProviderStatusResult>;
  normalizeProviderStatus(status: string): NormalizedProviderStatus;
  verifyCallback?(
    payload: ProviderCallbackPayload,
    context: { notifToken?: string | null },
  ): boolean;
  getProviderReference(result: ProviderPaymentResult | ProviderStatusResult): string | null;
}

export function mapNormalizedToPaymentStatus(
  status: NormalizedProviderStatus,
): PaymentStatus {
  switch (status) {
    case "CREATED":
      return "CREATED";
    case "PENDING":
      return "PENDING";
    case "SUCCEEDED":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    case "EXPIRED":
      return "EXPIRED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}
