import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSalesReport } from "@/api/reports";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { ReportPeriodSelector } from "@/components/ReportPeriodSelector";
import { FormMessage } from "@/components/AuthScreen";
import {
  getTodayRange,
  type ReportPeriodPreset,
  type ReportPeriodRange,
  type SalesReportResponse,
} from "@/reports";
import { reportsHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import { formatPaymentMethod } from "@/sales";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function SalesReportScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [preset, setPreset] = useState<ReportPeriodPreset>("today");
  const [range, setRange] = useState<ReportPeriodRange>(getTodayRange());
  const [report, setReport] = useState<SalesReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadReport = useCallback(
    async (refreshing = false) => {
      if (!accessToken || !currentBusiness) return;
      if (refreshing) setIsRefreshing(true);
      else setIsLoading(true);
      setErrorMessage(undefined);
      try {
        const data = await getSalesReport(accessToken, currentBusiness.id, range);
        setReport(data);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/(auth)/login");
          return;
        }
        setErrorMessage(getUserFacingErrorMessage(error));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, currentBusiness, range, router],
  );

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadReport(true)} />
        }
      >
        <Pressable accessibilityRole="button" onPress={() => router.replace(reportsHref)}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Sales Performance</Text>
        <ReportPeriodSelector
          preset={preset}
          range={range}
          onChange={(nextPreset, nextRange) => {
            setPreset(nextPreset);
            setRange(nextRange);
          }}
        />
        <FormMessage message={errorMessage} type="error" />
        {isLoading ? (
          <ActivityIndicator size="large" color="#0F766E" />
        ) : report ? (
          <>
            <View style={styles.metricGrid}>
              <Metric label="Revenue" value={formatMoneyDisplay(report.summary.totalRevenue)} />
              <Metric label="COGS" value={formatMoneyDisplay(report.summary.totalCostOfGoodsSold)} />
              <Metric label="Gross Profit" value={formatMoneyDisplay(report.summary.grossProfit)} />
              <Metric label="Sales Count" value={String(report.summary.saleCount)} />
              <Metric label="Average Sale" value={formatMoneyDisplay(report.summary.averageSaleValue)} />
            </View>
            <Text style={styles.sectionTitle}>By Payment Method</Text>
            {report.byPaymentMethod.map((entry) => (
              <View key={String(entry.paymentMethod)} style={styles.row}>
                <Text style={styles.rowLabel}>
                  {entry.paymentMethod ? formatPaymentMethod(entry.paymentMethod as never) : "Unspecified"}
                </Text>
                <Text style={styles.rowValue}>
                  {formatMoneyDisplay(entry.revenue)} · {entry.saleCount} sales
                </Text>
              </View>
            ))}
            <Text style={styles.sectionTitle}>Daily Trend</Text>
            {report.byDay.map((entry) => (
              <View key={entry.date} style={styles.row}>
                <Text style={styles.rowLabel}>{entry.date}</Text>
                <Text style={styles.rowValue}>
                  {formatMoneyDisplay(entry.revenue)} · GP {formatMoneyDisplay(entry.grossProfit)}
                </Text>
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
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: {
    minWidth: "46%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 4,
  },
  metricLabel: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  metricValue: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A", marginTop: 8 },
  row: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 4,
  },
  rowLabel: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  rowValue: { fontSize: 14, color: "#64748B" },
});
