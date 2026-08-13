import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  listPayments,
  type PaymentListItem,
  type PaymentProvider,
  type PaymentStatus,
} from "@/api/payments";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormMessage } from "@/components/AuthScreen";
import {
  appHref,
  paymentDetailHref,
  reportPaymentsHref,
} from "@/navigation/hrefs";
import {
  formatPaymentStatusLabel,
  getAvailableProviderFilters,
  getPaymentStatusBadgeStyle,
  PAYMENT_STATUS_FILTERS,
  type PaymentProviderFilter,
  type PaymentStatusFilter,
} from "@/payments";
import { formatMoneyDisplay } from "@/products/money";
import {
  formatPaymentProvider,
  formatSaleDateTime,
  isVerifiedProviderPayment,
} from "@/sales";

const PAGE_SIZE = 20;

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const badgeStyle = getPaymentStatusBadgeStyle(status);

  return (
    <View style={[styles.statusBadge, { backgroundColor: badgeStyle.backgroundColor }]}>
      <Text style={[styles.statusBadgeText, { color: badgeStyle.color }]}>
        {formatPaymentStatusLabel(status)}
      </Text>
    </View>
  );
}

export default function PaymentsHistoryScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<PaymentStatusFilter>("all");
  const [providerFilter, setProviderFilter] =
    useState<PaymentProviderFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;
  const hasMore = payments.length < total;
  const providerFilters = useMemo(() => getAvailableProviderFilters(), []);

  const loadPayments = useCallback(
    async (options: {
      pageToLoad: number;
      replace: boolean;
      refreshing?: boolean;
    }) => {
      if (!accessToken || !businessId) {
        return;
      }

      if (options.refreshing) {
        setIsRefreshing(true);
      } else if (options.replace) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      setErrorMessage(undefined);

      try {
        const response = await listPayments(accessToken, businessId, {
          page: options.pageToLoad,
          limit: PAGE_SIZE,
          status:
            statusFilter === "all"
              ? undefined
              : (statusFilter as PaymentStatus),
          provider:
            providerFilter === "all"
              ? undefined
              : (providerFilter as PaymentProvider),
        });

        setTotal(response.total);
        setPage(response.page);
        setPayments((current) =>
          options.replace ? response.items : [...current, ...response.items],
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/(auth)/login");
          return;
        }

        setErrorMessage(getUserFacingErrorMessage(error));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [accessToken, businessId, providerFilter, router, statusFilter],
  );

  useEffect(() => {
    void loadPayments({ pageToLoad: 1, replace: true });
  }, [loadPayments]);

  const listEmptyComponent = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No payments found</Text>
        <Text style={styles.emptySubtitle}>
          Digital provider payments appear here after checkout.
        </Text>
      </View>
    );
  }, [isLoading]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace(appHref)}
          >
            <Text style={styles.backLink}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Payments</Text>
          <Text style={styles.subtitle}>
            {currentBusiness?.name} · Digital payment history
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(reportPaymentsHref)}
            style={styles.reportLink}
          >
            <Text style={styles.reportLinkText}>View Payment Report</Text>
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          {PAYMENT_STATUS_FILTERS.map((entry) => (
            <Pressable
              key={entry.value}
              accessibilityRole="button"
              onPress={() => setStatusFilter(entry.value)}
              style={[
                styles.filterChip,
                statusFilter === entry.value && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  statusFilter === entry.value && styles.filterChipTextActive,
                ]}
              >
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.filterRow}>
          {providerFilters.map((entry) => (
            <Pressable
              key={entry.value}
              accessibilityRole="button"
              onPress={() => setProviderFilter(entry.value)}
              style={[
                styles.filterChip,
                providerFilter === entry.value && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  providerFilter === entry.value && styles.filterChipTextActive,
                ]}
              >
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <FormMessage message={errorMessage} type="error" />

        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(paymentDetailHref(item.id))}
              style={({ pressed }) => [
                styles.paymentCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.paymentHeader}>
                <Text style={styles.providerLabel}>
                  {formatPaymentProvider(item.provider)}
                </Text>
                <Text style={styles.amount}>{formatMoneyDisplay(item.amount)}</Text>
              </View>

              <View style={styles.paymentMetaRow}>
                <PaymentStatusBadge status={item.status} />
                {item.status === "SUCCEEDED" &&
                isVerifiedProviderPayment(item.provider) ? (
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedBadgeText}>Verified</Text>
                  </View>
                ) : null}
              </View>

              {item.phoneNumberMasked ? (
                <Text style={styles.metaText}>{item.phoneNumberMasked}</Text>
              ) : null}

              {item.providerReferenceMasked ? (
                <Text style={styles.metaText}>
                  Ref: {item.providerReferenceMasked}
                </Text>
              ) : null}

              {item.sale ? (
                <Text style={styles.receiptText}>
                  Receipt: {item.sale.receiptNumber}
                </Text>
              ) : null}

              <Text style={styles.dateText}>
                {formatSaleDateTime(item.createdAt)}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={listEmptyComponent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() =>
                void loadPayments({ pageToLoad: 1, replace: true, refreshing: true })
              }
            />
          }
          onEndReached={() => {
            if (!isLoadingMore && hasMore) {
              void loadPayments({ pageToLoad: page + 1, replace: false });
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color="#0F766E" />
            ) : null
          }
        />
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
  },
  header: {
    paddingTop: 8,
    paddingBottom: 12,
    gap: 4,
  },
  backLink: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
  },
  reportLink: {
    marginTop: 4,
  },
  reportLinkText: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  filterChipActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  filterChipText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  paymentCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 16,
    marginBottom: 12,
    gap: 6,
  },
  cardPressed: {
    opacity: 0.92,
  },
  paymentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  providerLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  amount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F766E",
  },
  paymentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  verifiedBadge: {
    backgroundColor: "#ECFEFF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verifiedBadgeText: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "700",
  },
  metaText: {
    fontSize: 14,
    color: "#64748B",
  },
  receiptText: {
    fontSize: 14,
    color: "#334155",
    fontWeight: "600",
  },
  dateText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptySubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#64748B",
    textAlign: "center",
  },
  footerLoader: {
    paddingVertical: 16,
  },
});
