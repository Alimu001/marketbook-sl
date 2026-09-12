import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPurchasesReport } from "@/api/reports";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { ReportPeriodSelector } from "@/components/ReportPeriodSelector";
import { FormMessage } from "@/components/AuthScreen";
import { getTodayRange, type ReportPeriodPreset, type ReportPeriodRange, type PurchasesReportResponse } from "@/reports";
import { reportsHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";

export default function PurchasesReportScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [preset, setPreset] = useState<ReportPeriodPreset>("today");
  const [range, setRange] = useState<ReportPeriodRange>(getTodayRange());
  const [report, setReport] = useState<PurchasesReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadReport = useCallback(async () => {
    if (!accessToken || !currentBusiness) return;
    setIsLoading(true);
    try {
      setReport(await getPurchasesReport(accessToken, currentBusiness.id, range));
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
        <Text style={styles.title}>Purchases</Text>
        <ReportPeriodSelector preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
        <FormMessage message={errorMessage} type="error" />
        {isLoading ? <ActivityIndicator color="#0F766E" /> : report ? (
          <>
            <Text style={styles.metric}>Purchase Spend: {formatMoneyDisplay(report.summary.purchaseSpend)}</Text>
            <Text style={styles.metric}>Paid: {formatMoneyDisplay(report.summary.amountPaid)}</Text>
            <Text style={styles.metric}>Outstanding Generated: {formatMoneyDisplay(report.summary.outstandingGenerated)}</Text>
            <Text style={styles.metric}>Count: {report.summary.purchaseCount}</Text>
            <Text style={styles.section}>By Supplier</Text>
            {report.bySupplier.map((entry) => (
              <View key={entry.supplierId} style={styles.card}>
                <Text style={styles.cardTitle}>{entry.supplierName}</Text>
                <Text style={styles.cardMeta}>{formatMoneyDisplay(entry.purchaseSpend)} · {entry.purchaseCount} purchases</Text>
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
  metric: { fontSize: 16, fontWeight: "600", color: "#334155" },
  section: { fontSize: 18, fontWeight: "700", color: "#0F172A", marginTop: 8 },
  card: { backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  cardMeta: { fontSize: 14, color: "#64748B" },
});
