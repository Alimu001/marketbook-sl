import { MockPaymentProvider } from "./providers/mock.provider.js";
import { OrangeMoneyProvider } from "./providers/orangeMoney.provider.js";
import type { PaymentProviderAdapter } from "./payment-provider.js";
import type { PaymentProvider } from "../../../generated/prisma/client.js";
import { AppError } from "../../middleware/errorHandler.js";
import { env } from "../../config/env.js";
import { getAvailablePaymentProviders, paymentConfig } from "../../config/payments.js";

const mockProvider = new MockPaymentProvider();
const orangeMoneyProvider = new OrangeMoneyProvider();

export function getPaymentProviderAdapter(
  provider: PaymentProvider,
): PaymentProviderAdapter {
  if (provider === "MOCK") {
    if (!paymentConfig.mockEnabled || env.NODE_ENV === "production") {
      throw new AppError(
        503,
        "Mock payment provider is not available",
        "PAYMENT_PROVIDER_NOT_CONFIGURED",
      );
    }

    return mockProvider;
  }

  if (provider === "ORANGE_MONEY") {
    return orangeMoneyProvider;
  }

  if (provider === "AFRIMONEY") {
    throw new AppError(
      503,
      "Afrimoney is not configured",
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
    );
  }

  throw new AppError(
    400,
    "Unsupported payment provider",
    "PAYMENT_PROVIDER_UNSUPPORTED",
  );
}

export function assertProviderAvailable(provider: PaymentProvider): void {
  const available = getAvailablePaymentProviders();

  if (provider === "AFRIMONEY") {
    throw new AppError(
      503,
      "Afrimoney is not configured",
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
    );
  }

  if (!available.includes(provider as "MOCK" | "ORANGE_MONEY")) {
    throw new AppError(
      503,
      "Payment provider is not configured",
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
    );
  }
}

export function listConfiguredProviders(): Array<"MOCK" | "ORANGE_MONEY"> {
  return getAvailablePaymentProviders();
}
