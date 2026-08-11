import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getExpensesReport } from "@/api/reports";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { ReportPeriodSelector } from "@/components/ReportPeriodSelector";
import { FormMessage } from "@/components/AuthScreen";
import { getTodayRange, type ReportPeriodPreset, type ReportPeriodRange, type ExpensesReportResponse } from "@/reports";
import { reportsHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";

export default function ExpensesReportScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [preset, setPreset] = useState<ReportPeriodPreset>("today");
  const [range, setRange] = useState<ReportPeriodRange>(getTodayRange());
  const [report, setReport] = useState<ExpensesReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadReport = useCallback(async () => {
    if (!accessToken || !currentBusiness) return;
    setIsLoading(true);
    try {
      setReport(await getExpensesReport(accessToken, currentBusiness.id, range));
    } catch (error) {
      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, currentBusiness, range]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.replace(reportsHref)}><Text style={styles.backLink}>Back</Text></Pressable>
        <Text style={styles.title}>Expenses</Text>
        <ReportPeriodSelector preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
        <FormMessage message={errorMessage} type="error" />
        {isLoading ? <ActivityIndicator color="#0F766E" /> : report ? (
          <>
            <Text style={styles.total}>Total Operating Expenses: {formatMoneyDisplay(report.summary.totalOperatingExpenses)}</Text>
            <Text style={styles.note}>Archived expenses remain included in historical totals.</Text>
            {report.byCategory.map((entry) => (
              <View key={entry.categoryId} style={styles.card}>
                <Text style={styles.cardTitle}>{entry.categoryName}</Text>
                <Text style={styles.cardMeta}>{formatMoneyDisplay(entry.totalAmount)} · {entry.percentage}%</Text>
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
  total: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  note: { fontSize: 13, color: "#64748B" },
  card: { backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  cardMeta: { fontSize: 14, color: "#64748B" },
});
