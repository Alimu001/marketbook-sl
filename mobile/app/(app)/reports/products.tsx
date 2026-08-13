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
import { getTopProductsReport } from "@/api/reports";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { ReportPeriodSelector } from "@/components/ReportPeriodSelector";
import { FormMessage } from "@/components/AuthScreen";
import {
  getTodayRange,
  type ReportPeriodPreset,
  type ReportPeriodRange,
  type TopProductsReportResponse,
} from "@/reports";
import { reportsHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";

export default function TopProductsReportScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [preset, setPreset] = useState<ReportPeriodPreset>("today");
  const [range, setRange] = useState<ReportPeriodRange>(getTodayRange());
  const [sortBy, setSortBy] = useState<"quantity" | "revenue" | "grossProfit">("revenue");
  const [report, setReport] = useState<TopProductsReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadReport = useCallback(async () => {
    if (!accessToken || !currentBusiness) return;
    setIsLoading(true);
    setErrorMessage(undefined);
    try {
      setReport(await getTopProductsReport(accessToken, currentBusiness.id, range, sortBy));
    } catch (error) {
      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, currentBusiness, range, sortBy]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable accessibilityRole="button" onPress={() => router.replace(reportsHref)}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Top Products</Text>
        <ReportPeriodSelector preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
        <View style={styles.sortRow}>
          {(["revenue", "quantity", "grossProfit"] as const).map((key) => (
            <Pressable key={key} onPress={() => setSortBy(key)} style={[styles.sortChip, sortBy === key && styles.sortActive]}>
              <Text style={[styles.sortText, sortBy === key && styles.sortTextActive]}>{key === "grossProfit" ? "Profit" : key === "quantity" ? "Qty" : "Revenue"}</Text>
            </Pressable>
          ))}
        </View>
        <FormMessage message={errorMessage} type="error" />
        {isLoading ? <ActivityIndicator color="#0F766E" /> : report?.items.map((item, index) => (
          <View key={item.productId} style={styles.card}>
            <Text style={styles.rank}>{index + 1}. {item.name}</Text>
            <Text style={styles.meta}>{item.quantitySold} sold</Text>
            <Text style={styles.meta}>Revenue: {formatMoneyDisplay(item.revenue)}</Text>
            <Text style={styles.meta}>Gross Profit: {formatMoneyDisplay(item.grossProfit)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { padding: 24, gap: 12 },
  backLink: { color: "#0F766E", fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "700", color: "#0F172A" },
  sortRow: { flexDirection: "row", gap: 8 },
  sortChip: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#FFF" },
  sortActive: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  sortText: { color: "#475569", fontWeight: "600" },
  sortTextActive: { color: "#FFF" },
  card: { backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, gap: 4 },
  rank: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  meta: { fontSize: 14, color: "#64748B" },
});
