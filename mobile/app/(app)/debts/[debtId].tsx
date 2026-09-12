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
import { getDebt, listDebtPayments } from "@/api/debts";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import {
  formatCustomerDateTime,
  formatDebtStatus,
  type CustomerDebtSummary,
  type DebtPayment,
} from "@/customers";
import { debtPayHref, debtsHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import { formatPaymentMethod } from "@/sales";

export default function DebtDetailScreen() {
  const router = useRouter();
  const { debtId } = useLocalSearchParams<{ debtId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [debt, setDebt] = useState<CustomerDebtSummary | null>(null);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;
  const canPay = debt && debt.status !== "PAID";

  const loadDebt = useCallback(async () => {
    if (!accessToken || !businessId || !debtId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const [debtDetail, paymentsResponse] = await Promise.all([
        getDebt(accessToken, businessId, debtId),
        listDebtPayments(accessToken, businessId, debtId, { page: 1, limit: 20 }),
      ]);
      setDebt(debtDetail);
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
  }, [accessToken, businessId, debtId, router]);

  useEffect(() => {
    void loadDebt();
  }, [loadDebt]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!debt) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <FormMessage message={errorMessage ?? "Debt not found."} type="error" />
          <FormButton label="Back to Debts" onPress={() => router.replace(debtsHref)} />
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

        <Text style={styles.title}>Debt Details</Text>
        <Text style={styles.receipt}>Receipt: {debt.receiptNumber}</Text>
        <Text style={styles.status}>{formatDebtStatus(debt.status)}</Text>

        <View style={styles.summary}>
          <DetailRow label="Original Amount" value={formatMoneyDisplay(debt.originalAmount)} />
          <DetailRow label="Amount Paid" value={formatMoneyDisplay(debt.amountPaid)} />
          <DetailRow
            label="Outstanding"
            value={formatMoneyDisplay(debt.outstandingAmount)}
          />
          <DetailRow
            label="Created"
            value={formatCustomerDateTime(debt.createdAt)}
          />
        </View>

        {canPay ? (
          <FormButton
            label="Record Payment"
            onPress={() => router.push(debtPayHref(debt.id))}
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
                {formatCustomerDateTime(payment.createdAt)}
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
  receipt: {
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
