import { env } from "./env.js";

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment variable value: ${value}`);
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

const mockEnabled = parseBoolean(process.env.PAYMENT_MOCK_ENABLED, env.NODE_ENV !== "production");
const orangeMoneyEnabled = parseBoolean(process.env.ORANGE_MONEY_ENABLED, false);

if (env.NODE_ENV === "production" && mockEnabled) {
  throw new Error("PAYMENT_MOCK_ENABLED must not be true in production");
}

export const paymentConfig = {
  mockEnabled,
  orangeMoneyEnabled,
  paymentExpiryMinutes: Number.parseInt(process.env.PAYMENT_EXPIRY_MINUTES ?? "15", 10),
  orangeMoney: {
    baseUrl: optionalEnv("ORANGE_MONEY_BASE_URL"),
    clientId: optionalEnv("ORANGE_MONEY_CLIENT_ID"),
    clientSecret: optionalEnv("ORANGE_MONEY_CLIENT_SECRET"),
    merchantKey: optionalEnv("ORANGE_MONEY_MERCHANT_KEY"),
    countryPath: optionalEnv("ORANGE_MONEY_COUNTRY_PATH") ?? "dev",
    currency: optionalEnv("ORANGE_MONEY_CURRENCY") ?? "OUV",
    returnUrl: optionalEnv("ORANGE_MONEY_RETURN_URL"),
    cancelUrl: optionalEnv("ORANGE_MONEY_CANCEL_URL"),
    callbackUrl: optionalEnv("ORANGE_MONEY_CALLBACK_URL"),
    lang: optionalEnv("ORANGE_MONEY_LANG") ?? "en",
  },
} as const;

export function isOrangeMoneyConfigured(): boolean {
  const config = paymentConfig.orangeMoney;
  return Boolean(
    paymentConfig.orangeMoneyEnabled &&
      config.baseUrl &&
      config.clientId &&
      config.clientSecret &&
      config.merchantKey &&
      config.returnUrl &&
      config.callbackUrl,
  );
}

export function getAvailablePaymentProviders(): Array<"MOCK" | "ORANGE_MONEY"> {
  const providers: Array<"MOCK" | "ORANGE_MONEY"> = [];

  if (paymentConfig.mockEnabled && env.NODE_ENV !== "production") {
    providers.push("MOCK");
  }

  if (isOrangeMoneyConfigured()) {
    providers.push("ORANGE_MONEY");
  }

  return providers;
}
