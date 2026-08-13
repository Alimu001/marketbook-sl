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
import { getDashboardSummary } from "@/api/reports";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { formatBusinessRole, useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { ReportPeriodSelector } from "@/components/ReportPeriodSelector";
import {
  getTodayRange,
  type DashboardSummary,
  type ReportPeriodPreset,
  type ReportPeriodRange,
} from "@/reports";
import {
  appHref,
  businessCreateHref,
  businessSelectHref,
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
} from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";

const QUICK_ACTIONS = [
  { label: "Reports", href: reportsHref, enabled: true },
  { label: "Products", href: productsHref, enabled: true },
  { label: "Inventory", href: inventoryHref, enabled: true },
  { label: "Sales", href: salesHref, enabled: true },
  { label: "Customers", href: customersHref, enabled: true },
  { label: "Debts", href: debtsHref, enabled: true },
  { label: "Suppliers", href: suppliersHref, enabled: true },
  { label: "Purchases", href: purchasesHref, enabled: true },
  { label: "Payables", href: payablesHref, enabled: true },
  { label: "Expenses", href: expensesHref, enabled: true },
  { label: "Payments", href: paymentsHref, enabled: true },
] as const;

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function AppHomeScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const [preset, setPreset] = useState<ReportPeriodPreset>("today");
  const [range, setRange] = useState<ReportPeriodRange>(getTodayRange());
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadDashboard = useCallback(
    async (refreshing = false) => {
      if (!accessToken || !currentBusiness) {
        setDashboard(null);
        return;
      }

      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage(undefined);

      try {
        const summary = await getDashboardSummary(
          accessToken,
          currentBusiness.id,
          range,
        );
        setDashboard(summary);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout();
          router.replace("/(auth)/login");
          return;
        }

        setErrorMessage(getUserFacingErrorMessage(error));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, currentBusiness, logout, range, router],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleLogout = async () => {
    setDashboard(null);
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadDashboard(true)}
          />
        }
      >
        <Text style={styles.brand}>MarketBook SL</Text>
        <Text style={styles.businessName}>{currentBusiness.name}</Text>
        <Text style={styles.roleLine}>
          Role: {formatBusinessRole(currentBusiness.role)}
        </Text>

        <ReportPeriodSelector
          preset={preset}
          range={range}
          onChange={(nextPreset, nextRange) => {
            setPreset(nextPreset);
            setRange(nextRange);
          }}
        />

        <FormMessage message={errorMessage} type="error" />

        {isLoading && !dashboard ? (
          <ActivityIndicator size="large" color="#0F766E" style={styles.loader} />
        ) : dashboard ? (
          <>
            <View style={styles.metricGrid}>
              <MetricCard
                label="Sales Revenue"
                value={formatMoneyDisplay(dashboard.salesRevenue)}
              />
              <MetricCard
                label="Gross Profit"
                value={formatMoneyDisplay(dashboard.grossProfit)}
              />
              <MetricCard
                label="Operating Expenses"
                value={formatMoneyDisplay(dashboard.operatingExpenses)}
              />
              <MetricCard
                label="Estimated Net Operating Profit"
                value={formatMoneyDisplay(dashboard.estimatedNetOperatingProfit)}
              />
            </View>

            <View style={styles.secondaryMetrics}>
              <Text style={styles.secondaryLine}>
                Receivables: {formatMoneyDisplay(dashboard.customerReceivables)}
              </Text>
              <Text style={styles.secondaryLine}>
                Payables: {formatMoneyDisplay(dashboard.supplierPayables)}
              </Text>
              <Text style={styles.secondaryLine}>
                Low Stock: {dashboard.lowStockCount} products
              </Text>
              <Text style={styles.secondaryLine}>
                Sales Count: {dashboard.salesCount}
              </Text>
              <Text style={styles.secondaryLine}>
                Purchase Spend: {formatMoneyDisplay(dashboard.purchaseSpend)}
              </Text>
            </View>
          </>
        ) : null}

        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                onPress={() => router.push(action.href)}
                style={({ pressed }) => [
                  styles.quickActionButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.quickActionTextEnabled}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <FormButton label="Sign Out" onPress={() => void handleLogout()} />
      </ScrollView>
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
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
  loader: {
    marginVertical: 24,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
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
  metricLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  secondaryMetrics: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 6,
  },
  secondaryLine: {
    fontSize: 15,
    color: "#334155",
    fontWeight: "600",
  },
  sectionTitle: {
    marginTop: 8,
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
  quickActionTextEnabled: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0F766E",
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
