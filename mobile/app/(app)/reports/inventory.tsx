import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getInventoryReport } from "@/api/reports";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { type InventoryReportResponse } from "@/reports";
import { inventoryHref, reportsHref } from "@/navigation/hrefs";

export default function InventoryReportScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [report, setReport] = useState<InventoryReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadReport = useCallback(async () => {
    if (!accessToken || !currentBusiness) return;
    setIsLoading(true);
    try {
      setReport(await getInventoryReport(accessToken, currentBusiness.id));
    } catch (error) {
      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, currentBusiness]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  const lowStockItems = report?.items.filter((item) => item.isLowStock || Number(item.quantity) <= 0) ?? [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.replace(reportsHref)}><Text style={styles.backLink}>Back</Text></Pressable>
        <Text style={styles.title}>Inventory Summary</Text>
        <Text style={styles.subtitle}>Quantities only — no FIFO valuation in this phase</Text>
        <FormMessage message={errorMessage} type="error" />
        {isLoading ? <ActivityIndicator color="#0F766E" /> : report ? (
          <>
            <Text style={styles.metric}>Total Products: {report.totalProducts}</Text>
            <Text style={styles.metric}>Active: {report.activeProducts}</Text>
            <Text style={styles.metric}>Low Stock: {report.lowStockProducts}</Text>
            <Text style={styles.metric}>Zero Stock: {report.zeroStockProducts}</Text>
            {lowStockItems.map((item) => (
              <View key={item.productId} style={styles.card}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardMeta}>{item.quantity} {item.unit} · threshold {item.lowStockThreshold}</Text>
              </View>
            ))}
            <FormButton label="Open Inventory" onPress={() => router.push(inventoryHref)} />
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
  subtitle: { fontSize: 14, color: "#64748B" },
  metric: { fontSize: 16, fontWeight: "600", color: "#334155" },
  card: { backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  cardMeta: { fontSize: 14, color: "#64748B" },
});
