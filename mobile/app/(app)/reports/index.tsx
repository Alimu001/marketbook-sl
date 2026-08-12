import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { appHref, reportExpensesHref, reportInventoryHref, reportPayablesHref, reportProductsHref, reportPurchasesHref, reportReceivablesHref, reportSalesHref, reportWalletsHref } from "@/navigation/hrefs";

const REPORT_CARDS = [
  { label: "Sales Performance", href: reportSalesHref, description: "Revenue, COGS, and gross profit" },
  { label: "Top Products", href: reportProductsHref, description: "Best sellers by revenue and profit" },
  { label: "Purchases", href: reportPurchasesHref, description: "Supplier purchase spend" },
  { label: "Expenses", href: reportExpensesHref, description: "Operating expenses by category" },
  { label: "Customer Receivables", href: reportReceivablesHref, description: "Outstanding customer debts" },
  { label: "Customer Store Credit", href: reportWalletsHref, description: "Store credit liability to customers" },
  { label: "Supplier Payables", href: reportPayablesHref, description: "Outstanding supplier balances" },
  { label: "Inventory", href: reportInventoryHref, description: "Stock levels and low-stock alerts" },
] as const;

export default function ReportsHomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable accessibilityRole="button" onPress={() => router.replace(appHref)}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>Operational analytics from live business data</Text>

        <View style={styles.cards}>
          {REPORT_CARDS.map((card) => (
            <Pressable
              key={card.label}
              accessibilityRole="button"
              onPress={() => router.push(card.href)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <Text style={styles.cardTitle}>{card.label}</Text>
              <Text style={styles.cardDescription}>{card.description}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { padding: 24, gap: 12 },
  backLink: { color: "#0F766E", fontWeight: "700", fontSize: 15 },
  title: { fontSize: 28, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 15, color: "#64748B", marginBottom: 8 },
  cards: { gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 6,
  },
  cardPressed: { opacity: 0.92 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#0F766E" },
  cardDescription: { fontSize: 14, color: "#64748B", lineHeight: 20 },
});
