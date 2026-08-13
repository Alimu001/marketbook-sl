import type {
  CreateProviderPaymentInput,
  NormalizedProviderStatus,
  PaymentProviderAdapter,
  ProviderCallbackPayload,
  ProviderPaymentResult,
  ProviderStatusResult,
} from "../payment-provider.js";

interface MockPaymentState {
  pollCount: number;
  outcome: NormalizedProviderStatus;
}

const mockStates = new Map<string, MockPaymentState>();

function resolveOutcome(phoneNumber?: string): NormalizedProviderStatus {
  const digits = (phoneNumber ?? "").replace(/\D/g, "");
  const lastDigit = digits.at(-1);

  if (lastDigit === "1") {
    return "FAILED";
  }

  if (lastDigit === "2") {
    return "EXPIRED";
  }

  if (lastDigit === "3") {
    return "PENDING";
  }

  return "SUCCEEDED";
}

function getState(merchantReference: string, phoneNumber?: string): MockPaymentState {
  const existing = mockStates.get(merchantReference);
  if (existing) {
    return existing;
  }

  const state: MockPaymentState = {
    pollCount: 0,
    outcome: resolveOutcome(phoneNumber),
  };
  mockStates.set(merchantReference, state);
  return state;
}

export class MockPaymentProvider implements PaymentProviderAdapter {
  readonly provider = "MOCK" as const;

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

  async createPayment(input: CreateProviderPaymentInput): Promise<ProviderPaymentResult> {
    const state = getState(input.merchantReference, input.phoneNumber);
    const payToken = `mock-pay-${input.merchantReference}`;
    const notifToken = `mock-notif-${input.merchantReference}`;

    return {
      providerTransactionId: `mock-txn-${input.merchantReference}`,
      payToken,
      notifToken,
      paymentUrl: `https://mock.marketbook.local/pay/${input.merchantReference}`,
      providerStatus: "INITIATED",
      normalizedStatus: state.outcome === "SUCCEEDED" ? "PENDING" : state.outcome,
      rawResponse: {
        mode: "MOCK",
        outcome: state.outcome,
      },
    };
  }

  async getPaymentStatus(input: {
    merchantReference: string;
    amount: string;
    payToken?: string | null;
    providerTransactionId?: string | null;
  }): Promise<ProviderStatusResult> {
    const state = mockStates.get(input.merchantReference) ?? {
      pollCount: 0,
      outcome: "SUCCEEDED" as NormalizedProviderStatus,
    };

    state.pollCount += 1;
    mockStates.set(input.merchantReference, state);

    let normalizedStatus = state.outcome;

    if (state.outcome === "SUCCEEDED" && state.pollCount < 1) {
      normalizedStatus = "PENDING";
    }

    const providerStatus =
      normalizedStatus === "SUCCEEDED"
        ? "SUCCESS"
        : normalizedStatus === "PENDING"
          ? "PENDING"
          : normalizedStatus;

    return {
      providerTransactionId: input.providerTransactionId ?? `mock-txn-${input.merchantReference}`,
      providerStatus,
      normalizedStatus,
      rawResponse: {
        pollCount: state.pollCount,
        outcome: state.outcome,
      },
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

export function resetMockPaymentProviderState(): void {
  mockStates.clear();
}
