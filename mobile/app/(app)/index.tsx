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
import { useOffline } from "@/offline/OfflineProvider";
import { getDashboardSummary } from "@/offline/repositories/reports.repository";
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
  businessCreateHref,
  businessSelectHref,
} from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export default function AppHomeScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const { networkStatus, getScope, isOfflineData } = useOffline();
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
        const scope = getScope();

        if (!scope) {
          setDashboard(null);
          return;
        }

        const result = await getDashboardSummary(
          scope,
          networkStatus,
          range,
        );

        setDashboard(result.data);
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
    [
      accessToken,
      currentBusiness,
      getScope,
      logout,
      networkStatus,
      range,
      router,
    ],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (!currentBusiness) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.content}>
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
        <View style={styles.dashboardHeader}>
          <Text style={styles.businessName} numberOfLines={1}>
            {currentBusiness.name}
          </Text>
          <Text style={styles.roleLine}>
            {formatBusinessRole(currentBusiness.role)}
          </Text>
        </View>
        <ReportPeriodSelector
          preset={preset}
          range={range}
          compact
          onChange={(nextPreset, nextRange) => {
            setPreset(nextPreset);
            setRange(nextRange);
          }}
        />

        {isOfflineData ? (
          <Text style={styles.offlineHint}>Showing saved dashboard data</Text>
        ) : null}

        <FormMessage message={errorMessage} type="error" />

        {isLoading && !dashboard ? (
          <ActivityIndicator size="large" color="#0F766E" style={styles.loader} />
        ) : dashboard ? (
          <>
            <View style={styles.metricGrid}>
              <MetricCard
                label="Revenue"
                value={formatMoneyDisplay(dashboard.salesRevenue)}
              />
              <MetricCard
                label="Gross profit"
                value={formatMoneyDisplay(dashboard.grossProfit)}
              />
              <MetricCard
                label="Expenses"
                value={formatMoneyDisplay(dashboard.operatingExpenses)}
              />
              <MetricCard
                label="Net profit"
                value={formatMoneyDisplay(dashboard.estimatedNetOperatingProfit)}
              />
            </View>

            <View style={styles.secondaryMetrics}>
              <Text style={styles.secondaryLine}>Receivables: {formatMoneyDisplay(dashboard.customerReceivables)}</Text>
              <Text style={styles.secondaryLine}>Payables: {formatMoneyDisplay(dashboard.supplierPayables)}</Text>
              <Text style={styles.secondaryLine}>Low stock: {dashboard.lowStockCount}</Text>
              <Text style={styles.secondaryLine}>Sales: {dashboard.salesCount}</Text>
              <Text style={styles.secondaryLine}>Purchases: {formatMoneyDisplay(dashboard.purchaseSpend)}</Text>
            </View>
          </>
        ) : null}

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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  content: {
    flex: 1,
    paddingTop: 16,
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0F172A",
  },
  dashboardHeader: {
    alignItems: "flex-start",
    gap: 3,
  },
  businessName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
  },
  roleLine: {
    fontSize: 12,
    color: "#0F766E",
    fontWeight: "700",
    backgroundColor: "#CCFBF1",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  offlineHint: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
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
    gap: 8,
  },
  metricCard: {
    minWidth: "46%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    gap: 2,
  },
  metricLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  secondaryMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    gap: 5,
  },
  secondaryLine: {
    width: "48%",
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
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
