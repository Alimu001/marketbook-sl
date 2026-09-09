import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { canViewFinancialReports, useBusiness } from "@/business";
import {
  customersHref,
  debtsHref,
  expensesHref,
  inventoryHref,
  payablesHref,
  paymentsHref,
  productsHref,
  purchasesHref,
  reportsHref,
  salesHref,
  suppliersHref,
  syncHref,
} from "@/navigation/hrefs";

const SERVICES = [
  { label: "Sales", href: salesHref },
  { label: "Products", href: productsHref },
  { label: "Inventory", href: inventoryHref },
  { label: "Customers", href: customersHref },
  { label: "Debts", href: debtsHref },
  { label: "Purchases", href: purchasesHref },
  { label: "Suppliers", href: suppliersHref },
  { label: "Payables", href: payablesHref },
  { label: "Expenses", href: expensesHref },
  { label: "Payments", href: paymentsHref },
  { label: "Reports", href: reportsHref },
  { label: "Offline & Sync", href: syncHref },
] as const;

export default function ServicesScreen() {
  const router = useRouter();
  const { currentBusiness } = useBusiness();
  const visibleServices = SERVICES.filter(
    (service) =>
      service.label !== "Reports" ||
      canViewFinancialReports(currentBusiness?.role),
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>MarketBook SL</Text>
        <Text style={styles.title}>Services</Text>
        <Text style={styles.subtitle}>Choose what you want to manage.</Text>

        <View style={styles.grid}>
          {visibleServices.map((service) => (
            <Pressable
              key={service.label}
              accessibilityRole="button"
              onPress={() => router.push(service.href)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <Text style={styles.cardText}>{service.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 8 },
  eyebrow: { color: "#0F766E", fontSize: 16, fontWeight: "700" },
  title: { color: "#0F172A", fontSize: 30, fontWeight: "700" },
  subtitle: { color: "#64748B", fontSize: 16, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    minWidth: "46%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  cardText: { color: "#0F766E", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.9 },
});
