import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth";
import { formatBusinessRole, useBusiness } from "@/business";
import { FormButton } from "@/components/AuthScreen";
import { appHref, businessCreateHref, businessSelectHref, customersHref, debtsHref, expensesHref, inventoryHref, payablesHref, productsHref, purchasesHref, salesHref, suppliersHref } from "@/navigation/hrefs";

const QUICK_ACTIONS = [
  { label: "Products", href: productsHref, enabled: true },
  { label: "Inventory", href: inventoryHref, enabled: true },
  { label: "Sales", href: salesHref, enabled: true },
  { label: "Customers", href: customersHref, enabled: true },
  { label: "Debts", href: debtsHref, enabled: true },
  { label: "Suppliers", href: suppliersHref, enabled: true },
  { label: "Purchases", href: purchasesHref, enabled: true },
  { label: "Payables", href: payablesHref, enabled: true },
  { label: "Expenses", href: expensesHref, enabled: true },
] as const;

export default function AppHomeScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { currentBusiness, businesses } = useBusiness();

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  if (!currentBusiness) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.brand}>MarketBook SL</Text>
            <Text style={styles.title}>Welcome to MarketBook SL</Text>
            <Text style={styles.subtitle}>
              Set up your first business to start managing sales, products, and
              records.
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(businessCreateHref)}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Create Business</Text>
            </Pressable>

            {businesses.length > 1 ? (
              <FormButton
                label="Choose a Business"
                variant="secondary"
                onPress={() => router.push(businessSelectHref)}
              />
            ) : null}

            <FormButton label="Sign Out" onPress={() => void handleLogout()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.brand}>MarketBook SL</Text>
          <Text style={styles.businessName}>{currentBusiness.name}</Text>
          <Text style={styles.roleLine}>
            Role: {formatBusinessRole(currentBusiness.role)}
          </Text>
          <Text style={styles.subtitle}>Welcome to your business.</Text>

          <View style={styles.quickActionsSection}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActionsGrid}>
              {QUICK_ACTIONS.map((action) => (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  disabled={!action.enabled}
                  onPress={() => {
                    if (action.enabled && "href" in action) {
                      router.push(action.href);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.quickActionButton,
                    !action.enabled && styles.quickActionDisabled,
                    pressed && action.enabled && styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.quickActionText,
                      !action.enabled && styles.quickActionTextDisabled,
                      action.enabled && styles.quickActionTextEnabled,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <FormButton label="Sign Out" onPress={() => void handleLogout()} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    paddingTop: 16,
    gap: 12,
  },
  brand: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F766E",
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0F172A",
  },
  businessName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
  },
  roleLine: {
    fontSize: 16,
    color: "#475569",
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 26,
    color: "#475569",
  },
  sectionTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  quickActionsSection: {
    gap: 12,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  quickActionButton: {
    minWidth: "46%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  quickActionDisabled: {
    opacity: 0.65,
  },
  quickActionText: {
    fontSize: 16,
    fontWeight: "600",
  },
  quickActionTextEnabled: {
    color: "#0F766E",
  },
  quickActionTextDisabled: {
    color: "#64748B",
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#0F766E",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.9,
  },
});
