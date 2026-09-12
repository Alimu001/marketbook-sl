import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPaymentsReport, type PaymentsReportResponse } from "@/api/payments";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormMessage } from "@/components/AuthScreen";
import { formatPaymentProviderFilterLabel } from "@/payments";
import { paymentsHref, reportsHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";

export default function PaymentsReportScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [report, setReport] = useState<PaymentsReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadReport = useCallback(async () => {
    if (!accessToken || !currentBusiness) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      setReport(await getPaymentsReport(accessToken, currentBusiness.id));
    } catch (error) {
      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, currentBusiness]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.replace(reportsHref)}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Digital Payments</Text>
        <Text style={styles.subtitle}>
          Verified provider payment settlement (not additional sales revenue)
        </Text>
        <Pressable onPress={() => router.push(paymentsHref)}>
          <Text style={styles.link}>View Payment History</Text>
        </Pressable>

        <FormMessage message={errorMessage} type="error" />

        {isLoading ? (
          <ActivityIndicator color="#0F766E" />
        ) : report ? (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.metric}>
                Successful Payments: {report.totals.succeededCount}
              </Text>
              <Text style={styles.metric}>
                Successful Amount: {formatMoneyDisplay(report.totals.succeededAmount)}
              </Text>
              <Text style={styles.metric}>Pending: {report.totals.pendingCount}</Text>
              <Text style={styles.metric}>Failed: {report.totals.failedCount}</Text>
              <Text style={styles.metric}>Expired: {report.totals.expiredCount}</Text>
            </View>

            {report.byProvider.map((entry) => (
              <View key={entry.provider} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {formatPaymentProviderFilterLabel(entry.provider)}
                </Text>
                <Text style={styles.cardMeta}>
                  Successful: {entry.succeededCount} ·{" "}
                  {formatMoneyDisplay(entry.succeededAmount)}
                </Text>
                <Text style={styles.cardMeta}>Pending: {entry.pendingCount}</Text>
                <Text style={styles.cardMeta}>Failed: {entry.failedCount}</Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { padding: 24, gap: 12 },
  backLink: { color: "#0F766E", fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 14, color: "#64748B", lineHeight: 20 },
  link: { color: "#0F766E", fontWeight: "600", fontSize: 15 },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 8,
  },
  metric: { fontSize: 16, fontWeight: "600", color: "#334155" },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 4,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  cardMeta: { fontSize: 14, color: "#64748B" },
});
