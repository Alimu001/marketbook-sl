import type { PaymentProvider, PaymentStatus } from "@/api/payments";
import { isDevelopmentApp } from "@/sales";

export const PAYMENT_STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "SUCCEEDED", label: "Successful" },
  { value: "FAILED", label: "Failed" },
  { value: "EXPIRED", label: "Expired" },
] as const;

export type PaymentStatusFilter =
  (typeof PAYMENT_STATUS_FILTERS)[number]["value"];

export const PAYMENT_PROVIDER_FILTERS = [
  { value: "all", label: "All Providers" },
  { value: "MOCK", label: "Test Mobile Money", devOnly: true },
  { value: "ORANGE_MONEY", label: "Orange Money" },
] as const;

export type PaymentProviderFilter =
  | "all"
  | "MOCK"
  | "ORANGE_MONEY";

export function getAvailableProviderFilters(): Array<{
  value: PaymentProviderFilter;
  label: string;
}> {
  return PAYMENT_PROVIDER_FILTERS.filter((entry) => {
    if (entry.value === "MOCK") {
      return isDevelopmentApp();
    }

    return true;
  }).map(({ value, label }) => ({ value, label }));
}

export function formatPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "CREATED":
      return "Created";
    case "PENDING":
      return "Pending";
    case "SUCCEEDED":
      return "Successful";
    case "FAILED":
      return "Failed";
    case "EXPIRED":
      return "Expired";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export function getPaymentStatusBadgeStyle(status: PaymentStatus): {
  backgroundColor: string;
  color: string;
} {
  switch (status) {
    case "SUCCEEDED":
      return { backgroundColor: "#DCFCE7", color: "#166534" };
    case "PENDING":
    case "CREATED":
      return { backgroundColor: "#FEF3C7", color: "#92400E" };
    case "FAILED":
      return { backgroundColor: "#FEE2E2", color: "#B91C1C" };
    case "EXPIRED":
    case "CANCELLED":
      return { backgroundColor: "#F1F5F9", color: "#475569" };
    default:
      return { backgroundColor: "#E2E8F0", color: "#334155" };
  }
}

export function isPendingPaymentStatus(status: PaymentStatus): boolean {
  return status === "CREATED" || status === "PENDING";
}

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return (
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "EXPIRED" ||
    status === "CANCELLED"
  );
}

export function formatPaymentProviderFilterLabel(
  provider: PaymentProvider,
): string {
  switch (provider) {
    case "MOCK":
      return "Test Mobile Money";
    case "ORANGE_MONEY":
      return "Orange Money";
    case "AFRIMONEY":
      return "AfriMoney";
    default:
      return provider;
  }
}
