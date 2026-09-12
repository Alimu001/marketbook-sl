import { paymentConfig } from "../../../config/payments.js";
import { AppError } from "../../../middleware/errorHandler.js";
import type {
  CreateProviderPaymentInput,
  NormalizedProviderStatus,
  PaymentProviderAdapter,
  ProviderCallbackPayload,
  ProviderPaymentResult,
  ProviderStatusResult,
} from "../payment-provider.js";

interface OrangeOAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface OrangeWebPaymentResponse {
  status?: number;
  message?: string;
  pay_token?: string;
  payment_url?: string;
  notif_token?: string;
}

interface OrangeStatusResponse {
  status?: string;
  txnid?: string;
  message?: string;
}

const SENSITIVE_KEYS = new Set([
  "access_token",
  "client_secret",
  "authorization",
  "pay_token",
  "notif_token",
]);

function redactPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      redacted[key] = "[REDACTED]";
      continue;
    }

    redacted[key] = value;
  }

  return redacted;
}

function assertOrangeConfigured(): void {
  const config = paymentConfig.orangeMoney;

  if (
    !paymentConfig.orangeMoneyEnabled ||
    !config.baseUrl ||
    !config.clientId ||
    !config.clientSecret ||
    !config.merchantKey
  ) {
    throw new AppError(
      503,
      "Orange Money is not configured",
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
    );
  }
}

function toProviderAmount(amount: string): number {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new AppError(400, "Invalid payment amount", "PAYMENT_AMOUNT_INVALID");
  }

  return Math.round(numeric);
}

export class OrangeMoneyProvider implements PaymentProviderAdapter {
  readonly provider = "ORANGE_MONEY" as const;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  normalizeProviderStatus(status: string): NormalizedProviderStatus {
    const normalized = status.toUpperCase();

    if (normalized === "SUCCESS" || normalized === "SUCCEEDED") {
      return "SUCCEEDED";
    }

    if (normalized === "FAILED") {
      return "FAILED";
    }

    if (normalized === "EXPIRED") {
      return "EXPIRED";
    }

    if (normalized === "CANCELLED") {
      return "CANCELLED";
    }

    if (normalized === "INITIATED") {
      return "CREATED";
    }

    return "PENDING";
  }

  private get apiBase(): string {
    assertOrangeConfigured();
    return paymentConfig.orangeMoney.baseUrl!.replace(/\/$/, "");
  }

  private get countryPath(): string {
    return paymentConfig.orangeMoney.countryPath;
  }

  private async getAccessToken(): Promise<string> {
    assertOrangeConfigured();

    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 30_000) {
      return this.cachedToken.value;
    }

    const credentials = Buffer.from(
      `${paymentConfig.orangeMoney.clientId}:${paymentConfig.orangeMoney.clientSecret}`,
    ).toString("base64");

    const response = await fetch(
      `${this.apiBase}/orange-money-webpay/${this.countryPath}/v1/oauth/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
      },
    );

    if (!response.ok) {
      throw new AppError(
        502,
        "Orange Money authentication failed",
        "PAYMENT_PROVIDER_UNAVAILABLE",
      );
    }

    const body = (await response.json()) as OrangeOAuthResponse;

    this.cachedToken = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };

    return body.access_token;
  }

  async createPayment(input: CreateProviderPaymentInput): Promise<ProviderPaymentResult> {
    assertOrangeConfigured();

    const token = await this.getAccessToken();
    const orderId = input.merchantReference.slice(0, 30);
    const amount = toProviderAmount(input.amount);

    const payload = {
      merchant_key: paymentConfig.orangeMoney.merchantKey,
      currency: input.currency || paymentConfig.orangeMoney.currency,
      order_id: orderId,
      amount,
      return_url: input.returnUrl ?? paymentConfig.orangeMoney.returnUrl,
      cancel_url: input.cancelUrl ?? paymentConfig.orangeMoney.cancelUrl,
      notif_url: input.callbackUrl ?? paymentConfig.orangeMoney.callbackUrl,
      lang: paymentConfig.orangeMoney.lang,
      reference: input.description ?? "MarketBook payment",
    };

    const response = await fetch(
      `${this.apiBase}/orange-money-webpay/${this.countryPath}/v1/webpayment`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const body = (await response.json()) as OrangeWebPaymentResponse;

    if (!response.ok || !body.pay_token || !body.payment_url) {
      throw new AppError(
        502,
        "Orange Money payment initiation failed",
        "PAYMENT_PROVIDER_UNAVAILABLE",
        {
          details: {
            providerMessage: body.message ?? "Unknown provider error",
            providerResponse: redactPayload(body),
          },
        },
      );
    }

    return {
      providerTransactionId: orderId,
      payToken: body.pay_token,
      ...(body.notif_token ? { notifToken: body.notif_token } : {}),
      paymentUrl: body.payment_url,
      providerStatus: "INITIATED",
      normalizedStatus: "PENDING",
      rawResponse: redactPayload(body) as Record<string, unknown>,
    };
  }

  async getPaymentStatus(input: {
    merchantReference: string;
    amount: string;
    payToken?: string | null;
    providerTransactionId?: string | null;
  }): Promise<ProviderStatusResult> {
    assertOrangeConfigured();

    if (!input.payToken) {
      throw new AppError(
        409,
        "Payment verification token missing",
        "PAYMENT_VERIFICATION_FAILED",
      );
    }

    const token = await this.getAccessToken();
    const orderId = input.merchantReference.slice(0, 30);
    const amount = toProviderAmount(input.amount);

    const response = await fetch(
      `${this.apiBase}/orange-money-webpay/${this.countryPath}/v1/transactionstatus`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          order_id: orderId,
          amount,
          pay_token: input.payToken,
        }),
      },
    );

    const body = (await response.json()) as OrangeStatusResponse;

    if (!response.ok) {
      throw new AppError(
        502,
        "Orange Money status check failed",
        "PAYMENT_PROVIDER_UNAVAILABLE",
        {
          details: {
            providerMessage: body.message ?? "Unknown provider error",
            providerResponse: redactPayload(body),
          },
        },
      );
    }

    const providerStatus = body.status ?? "PENDING";

    return {
      providerTransactionId: body.txnid ?? input.providerTransactionId ?? orderId,
      providerStatus,
      normalizedStatus: this.normalizeProviderStatus(providerStatus),
      rawResponse: redactPayload(body) as Record<string, unknown>,
    };
  }

  verifyCallback(
    payload: ProviderCallbackPayload,
    context: { notifToken?: string | null },
  ): boolean {
    const token = payload.notif_token ?? payload.notifToken;
    return Boolean(token && context.notifToken && token === context.notifToken);
  }

  getProviderReference(result: ProviderPaymentResult | ProviderStatusResult): string | null {
    return result.providerTransactionId ?? null;
  }
}
