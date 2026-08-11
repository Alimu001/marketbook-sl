import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPayable, listPayablePayments } from "@/api/payables";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import {
  formatPayableStatus,
  formatSupplierDateTime,
  type SupplierPayableSummary,
  type SupplierPayment,
} from "@/suppliers";
import { payablePayHref, payablesHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import { formatPaymentMethod } from "@/sales";

export default function PayableDetailScreen() {
  const router = useRouter();
  const { payableId } = useLocalSearchParams<{ payableId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [payable, setPayable] = useState<SupplierPayableSummary | null>(null);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;
  const canPay = payable && payable.status !== "PAID";

  const loadPayable = useCallback(async () => {
    if (!accessToken || !businessId || !payableId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const [payableDetail, paymentsResponse] = await Promise.all([
        getPayable(accessToken, businessId, payableId),
        listPayablePayments(accessToken, businessId, payableId, {
          page: 1,
          limit: 20,
        }),
      ]);
      setPayable(payableDetail);
      setPayments(paymentsResponse.items);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }

      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, businessId, payableId, router]);

  useEffect(() => {
    void loadPayable();
  }, [loadPayable]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!payable) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <FormMessage
            message={errorMessage ?? "Payable not found."}
            type="error"
          />
          <FormButton
            label="Back to Payables"
            onPress={() => router.replace(payablesHref)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Payable Details</Text>
        <Text style={styles.purchaseNumber}>
          Purchase: {payable.purchaseNumber}
        </Text>
        <Text style={styles.status}>{formatPayableStatus(payable.status)}</Text>

        <View style={styles.summary}>
          <DetailRow
            label="Original Amount"
            value={formatMoneyDisplay(payable.originalAmount)}
          />
          <DetailRow
            label="Amount Paid"
            value={formatMoneyDisplay(payable.amountPaid)}
          />
          <DetailRow
            label="Outstanding"
            value={formatMoneyDisplay(payable.outstandingAmount)}
          />
          <DetailRow
            label="Created"
            value={formatSupplierDateTime(payable.createdAt)}
          />
        </View>

        {canPay ? (
          <FormButton
            label="Record Payment"
            onPress={() => router.push(payablePayHref(payable.id))}
          />
        ) : null}

        <Text style={styles.sectionTitle}>Payment History</Text>
        {payments.length === 0 ? (
          <Text style={styles.emptyText}>No payments recorded yet.</Text>
        ) : (
          payments.map((payment) => (
            <View key={payment.id} style={styles.paymentRow}>
              <Text style={styles.paymentAmount}>
                {formatMoneyDisplay(payment.amount)}
              </Text>
              <Text style={styles.paymentMeta}>
                {formatPaymentMethod(payment.paymentMethod)} ·{" "}
                {formatSupplierDateTime(payment.createdAt)}
              </Text>
              <Text style={styles.paymentMeta}>
                Balance: {formatMoneyDisplay(payment.balanceBefore)} →{" "}
                {formatMoneyDisplay(payment.balanceAfter)}
              </Text>
            </View>
          ))
        )}
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  backLink: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
  },
  purchaseNumber: {
    fontSize: 16,
    fontWeight: "600",
    color: "#475569",
  },
  status: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F766E",
  },
  summary: {
    marginTop: 8,
    gap: 8,
  },
  detailRow: {
    gap: 4,
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: 16,
    color: "#0F172A",
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 15,
    color: "#64748B",
  },
  paymentRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 4,
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  paymentMeta: {
    fontSize: 14,
    color: "#64748B",
  },
});
