import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getPayment,
  reconcilePayment,
  type PaymentDetail,
} from "@/api/payments";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import {
  formatPaymentStatusLabel,
  getPaymentStatusBadgeStyle,
  isPendingPaymentStatus,
} from "@/payments";
import {
  paymentsHref,
  saleDetailHref,
  saleNewHref,
} from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import {
  formatPaymentProvider,
  formatSaleDateTime,
  isVerifiedProviderPayment,
} from "@/sales";

const POLL_INTERVAL_MS = 4000;
const MAX_AUTO_POLL_MS = 2 * 60 * 1000;

function PaymentStatusBadge({ status }: { status: PaymentDetail["status"] }) {
  const badgeStyle = getPaymentStatusBadgeStyle(status);

  return (
    <View style={[styles.statusBadge, { backgroundColor: badgeStyle.backgroundColor }]}>
      <Text style={[styles.statusBadgeText, { color: badgeStyle.color }]}>
        {formatPaymentStatusLabel(status)}
      </Text>
    </View>
  );
}

function getFailureMessage(payment: PaymentDetail): string {
  if (payment.status === "EXPIRED") {
    return "This payment request expired.";
  }

  if (payment.status === "FAILED") {
    return payment.failureMessage ?? "Payment was not completed.";
  }

  if (payment.status === "CANCELLED") {
    return "This payment was cancelled.";
  }

  return payment.failureMessage ?? "Payment could not be completed.";
}

export default function PaymentDetailScreen() {
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [infoMessage, setInfoMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();

  const pollingStartedAtRef = useRef<number | null>(null);
  const isFocusedRef = useRef(false);

  const businessId = currentBusiness?.id;
  const role = currentBusiness?.role;
  const canReconcile = role === "owner" || role === "admin";

  const loadPayment = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!accessToken || !businessId || !paymentId) {
        return null;
      }

      if (!options.silent) {
        setIsRefreshing(true);
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
        setIsRefreshing(false);
      }
    },
    [accessToken, businessId, paymentId, router],
  );

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      pollingStartedAtRef.current = Date.now();
      void loadPayment();

      return () => {
        isFocusedRef.current = false;
        pollingStartedAtRef.current = null;
      };
    }, [loadPayment]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!payment || !isPendingPaymentStatus(payment.status)) {
        return;
      }

      const intervalId = setInterval(() => {
        if (!isFocusedRef.current) {
          return;
        }

        const startedAt = pollingStartedAtRef.current;
        if (startedAt && Date.now() - startedAt > MAX_AUTO_POLL_MS) {
          return;
        }

        void loadPayment({ silent: true });
      }, POLL_INTERVAL_MS);

      return () => clearInterval(intervalId);
    }, [payment?.status, loadPayment]),
  );

  const handleReconcile = async () => {
    if (!accessToken || !businessId || !paymentId || isReconciling) {
      return;
    }

    setIsReconciling(true);
    setErrorMessage(undefined);
    setInfoMessage(undefined);
    setSuccessMessage(undefined);

    try {
      const updated = await reconcilePayment(accessToken, businessId, paymentId);
      setPayment(updated);

      if (updated.status === "SUCCEEDED") {
        setSuccessMessage("Payment verified successfully.");
        return;
      }

      if (updated.status === "PENDING" || updated.status === "CREATED") {
        setInfoMessage("Payment is still pending.");
        return;
      }

      if (updated.status === "FAILED" || updated.status === "EXPIRED") {
        setInfoMessage(getFailureMessage(updated));
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }

      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsReconciling(false);
    }
  };

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
          <FormMessage type="error" message={errorMessage ?? "Payment not found."} />
          <FormButton label="Back to Payments" onPress={() => router.replace(paymentsHref)} />
        </View>
      </SafeAreaView>
    );
  }

  const providerLabel = formatPaymentProvider(payment.provider);
  const isPending = isPendingPaymentStatus(payment.status);
  const isFailed =
    payment.status === "FAILED" ||
    payment.status === "EXPIRED" ||
    payment.status === "CANCELLED";
  const initiatedByName =
    payment.initiatedBy.name ?? payment.initiatedBy.email;
  const pollingTimedOut =
    isPending &&
    pollingStartedAtRef.current !== null &&
    Date.now() - pollingStartedAtRef.current > MAX_AUTO_POLL_MS;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Payment Details</Text>
        <Text style={styles.subtitle}>{providerLabel}</Text>

        {successMessage ? (
          <FormMessage type="success" message={successMessage} />
        ) : null}
        {infoMessage ? <Text style={styles.infoMessage}>{infoMessage}</Text> : null}
        {errorMessage ? <FormMessage type="error" message={errorMessage} /> : null}

        {isPending ? (
          <View style={styles.pendingBanner}>
            <ActivityIndicator color="#0F766E" />
            <Text style={styles.pendingText}>
              {pollingTimedOut
                ? "Payment is still pending. Refresh or check status with the provider."
                : `Waiting for ${providerLabel} confirmation…`}
            </Text>
          </View>
        ) : null}

        {isFailed ? (
          <FormMessage type="error" message={getFailureMessage(payment)} />
        ) : null}

        {isPending ? (
          <Text style={styles.reservationNote}>
            Stock is temporarily reserved for this payment.
          </Text>
        ) : null}

        {isFailed ? (
          <Text style={styles.reservationNote}>
            Reserved stock has been released.
          </Text>
        ) : null}

        <View style={styles.card}>
          <DetailRow label="Payment Reference" value={payment.merchantReference} />
          <DetailRow label="Provider" value={providerLabel} />
          <DetailRow label="Amount" value={formatMoneyDisplay(payment.amount)} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <View style={styles.statusRow}>
              <PaymentStatusBadge status={payment.status} />
              {payment.status === "SUCCEEDED" &&
              isVerifiedProviderPayment(payment.provider) ? (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeText}>Verified</Text>
                </View>
              ) : null}
            </View>
          </View>
          {payment.phoneNumberMasked ? (
            <DetailRow label="Phone" value={payment.phoneNumberMasked} />
          ) : null}
          {payment.providerReferenceMasked ? (
            <DetailRow
              label="Provider Reference"
              value={payment.providerReferenceMasked}
            />
          ) : null}
          <DetailRow label="Created At" value={formatSaleDateTime(payment.createdAt)} />
          <DetailRow label="Updated At" value={formatSaleDateTime(payment.updatedAt)} />
          {payment.confirmedAt ? (
            <DetailRow
              label="Confirmed At"
              value={formatSaleDateTime(payment.confirmedAt)}
            />
          ) : null}
          {payment.failedAt ? (
            <DetailRow label="Failed At" value={formatSaleDateTime(payment.failedAt)} />
          ) : null}
          {payment.expiresAt ? (
            <DetailRow label="Expires At" value={formatSaleDateTime(payment.expiresAt)} />
          ) : null}
          <DetailRow label="Initiated By" value={initiatedByName} />
          {payment.sale ? (
            <DetailRow label="Receipt" value={payment.sale.receiptNumber} />
          ) : null}
        </View>

        {payment.status === "SUCCEEDED" && payment.sale ? (
          <FormButton
            label="View Receipt"
            onPress={() => router.push(saleDetailHref(payment.sale!.id))}
          />
        ) : null}

        {isPending && canReconcile ? (
          <>
            <FormButton
              label={isReconciling ? "Checking…" : "Check Payment Status"}
              disabled={isReconciling}
              onPress={() => void handleReconcile()}
            />
            <Text style={styles.reconcileHint}>
              MarketBook will verify the current status directly with the payment
              provider.
            </Text>
          </>
        ) : null}

        <FormButton
          label={isRefreshing ? "Refreshing…" : "Refresh"}
          variant="secondary"
          disabled={isRefreshing}
          onPress={() => void loadPayment()}
        />

        {isFailed ? (
          <FormButton
            label="Start New Sale"
            onPress={() => router.replace(saleNewHref)}
          />
        ) : null}

        <FormButton
          label="Back to Payments"
          variant="secondary"
          onPress={() => router.replace(paymentsHref)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748B",
    fontWeight: "600",
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
  reservationNote: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 12,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0F172A",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  verifiedBadge: {
    backgroundColor: "#ECFEFF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verifiedBadgeText: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "700",
  },
  reconcileHint: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
    marginTop: -8,
  },
  infoMessage: {
    fontSize: 15,
    color: "#475569",
    lineHeight: 22,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
  },
});
