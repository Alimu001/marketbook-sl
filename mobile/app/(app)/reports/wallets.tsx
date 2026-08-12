import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getWalletsReport } from "@/api/wallet";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormMessage } from "@/components/AuthScreen";
import { reportsHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import type { WalletsReport } from "@/api/wallet";

export default function WalletsReportScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [report, setReport] = useState<WalletsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadReport = useCallback(async () => {
    if (!accessToken || !currentBusiness) return;
    setIsLoading(true);
    try {
      setReport(await getWalletsReport(accessToken, currentBusiness.id));
    } catch (error) {
      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, currentBusiness]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.replace(reportsHref)}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Customer Store Credit</Text>
        <Text style={styles.subtitle}>
          Business liability owed to customers as store credit
        </Text>
        <FormMessage message={errorMessage} type="error" />
        {isLoading ? (
          <ActivityIndicator color="#0F766E" />
        ) : report ? (
          <>
            <Text style={styles.metric}>
              Total Liability: {formatMoneyDisplay(report.totalLiability)}
            </Text>
            <Text style={styles.metric}>
              Customers with Balance: {report.customerCountWithBalance}
            </Text>
            {report.topCustomers.map((entry) => (
              <View key={entry.customerId} style={styles.card}>
                <Text style={styles.cardTitle}>{entry.customerName}</Text>
                <Text style={styles.cardMeta}>
                  {formatMoneyDisplay(entry.balance)}
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
  subtitle: { fontSize: 14, color: "#64748B" },
  metric: { fontSize: 16, fontWeight: "600", color: "#334155" },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  cardMeta: { fontSize: 14, color: "#64748B" },
});
