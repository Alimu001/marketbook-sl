import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPayment, type PaymentDetail } from "@/api/payments";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { useOffline } from "@/offline";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { saleNewHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import { formatPaymentProvider } from "@/sales";

const POLL_INTERVAL_MS = 4000;

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"]);

function formatPaymentStatus(status: PaymentDetail["status"]): string {
  switch (status) {
    case "CREATED":
      return "Created";
    case "PENDING":
      return "Pending";
    case "SUCCEEDED":
      return "Succeeded";
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

function isPollingStatus(status: PaymentDetail["status"]): boolean {
  return status === "CREATED" || status === "PENDING";
}

export default function SalePaymentScreen() {
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const { isOnline } = useOffline();

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const hasNavigatedRef = useRef(false);

  const businessId = currentBusiness?.id;

  const loadPayment = useCallback(async () => {
    if (!accessToken || !businessId || !paymentId) {
      return null;
    }

    try {
      const detail = await getPayment(accessToken, businessId, paymentId);
      setPayment(detail);
      setErrorMessage(undefined);
      return detail;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return null;
      }

      setErrorMessage(getUserFacingErrorMessage(error));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, businessId, paymentId, router]);

  useEffect(() => {
    void loadPayment();
  }, [loadPayment]);

  useEffect(() => {
    if (!payment || !isPollingStatus(payment.status)) {
      return;
    }

    const intervalId = setInterval(() => {
      void loadPayment();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [payment?.status, loadPayment]);

  useEffect(() => {
    if (!payment || hasNavigatedRef.current) {
      return;
    }

    if (payment.status === "SUCCEEDED" && payment.sale?.id) {
      hasNavigatedRef.current = true;
      router.replace({
        pathname: "/(app)/sales/[saleId]",
        params: {
          saleId: payment.sale.id,
          completed: "1",
        },
      });
    }
  }, [payment, router]);

  if (isLoading && !payment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!payment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <FormMessage
            type="error"
            message={errorMessage ?? "Payment not found."}
          />
          <FormButton label="Back to New Sale" onPress={() => router.replace(saleNewHref)} />
        </View>
      </SafeAreaView>
    );
  }

  const isFailed =
    payment.status === "FAILED" ||
    payment.status === "EXPIRED" ||
    payment.status === "CANCELLED";
  const isPending = isPollingStatus(payment.status);

  const providerLabel = formatPaymentProvider(payment.provider);
  const isMockPayment = payment.provider === "MOCK";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>
          {isMockPayment ? "Test Mobile Money Payment" : `${providerLabel} Payment`}
        </Text>

        {errorMessage ? <FormMessage type="error" message={errorMessage} /> : null}

        {isPending && !isOnline ? (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingText}>
              Connection lost. Payment status will refresh when you&apos;re back online.
            </Text>
          </View>
        ) : null}

        {isPending && isOnline ? (
          <View style={styles.pendingBanner}>
            <ActivityIndicator color="#0F766E" />
            <Text style={styles.pendingText}>
              Waiting for {providerLabel} confirmation…
            </Text>
          </View>
        ) : null}

        {isFailed ? (
          <FormMessage
            type="error"
            message={
              payment.failureMessage ??
              (payment.status === "EXPIRED"
                ? "Payment expired before completion."
                : "Payment failed. Please try again.")
            }
          />
        ) : null}

        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Provider</Text>
            <Text style={styles.summaryValue}>{providerLabel}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={styles.summaryValue}>
              {formatMoneyDisplay(payment.amount)}
            </Text>
          </View>
          {payment.phoneNumberMasked ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Phone</Text>
              <Text style={styles.summaryValue}>{payment.phoneNumberMasked}</Text>
            </View>
          ) : null}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Status</Text>
            <Text
              style={[
                styles.summaryValue,
                payment.status === "SUCCEEDED" && styles.statusSuccess,
                isFailed && styles.statusFailed,
                isPending && styles.statusPending,
              ]}
            >
              {formatPaymentStatus(payment.status)}
            </Text>
          </View>
          {payment.providerReferenceMasked ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Reference</Text>
              <Text style={styles.summaryValue}>
                {payment.providerReferenceMasked}
              </Text>
            </View>
          ) : null}
        </View>

        {isFailed ? (
          <FormButton
            label="Try Again"
            onPress={() => router.replace(saleNewHref)}
          />
        ) : null}

        {!TERMINAL_STATUSES.has(payment.status) || isPending ? (
          <FormButton
            label="Refresh Status"
            variant="secondary"
            onPress={() => void loadPayment()}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 16,
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ECFEFF",
    borderRadius: 12,
    padding: 16,
  },
  pendingText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#0F766E",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 16,
    color: "#475569",
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  statusSuccess: {
    color: "#0F766E",
  },
  statusFailed: {
    color: "#DC2626",
  },
  statusPending: {
    color: "#D97706",
  },
});
