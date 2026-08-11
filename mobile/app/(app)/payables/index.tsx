import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { listBusinessPayables } from "@/api/payables";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormMessage } from "@/components/AuthScreen";
import {
  PAYABLE_STATUSES,
  formatPayableStatus,
  formatSupplierDateTime,
  type BusinessPayableListItem,
  type PayableStatus,
} from "@/suppliers";
import { appHref, payableDetailHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import { useDebouncedValue } from "@/products/useDebouncedValue";

const PAGE_SIZE = 20;

export default function PayablesListScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [payables, setPayables] = useState<BusinessPayableListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PayableStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const businessId = currentBusiness?.id;
  const hasMore = payables.length < total;

  const loadPayables = useCallback(
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
        const response = await listBusinessPayables(accessToken, businessId, {
          page: options.pageToLoad,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
        });

        setTotal(response.total);
        setPage(response.page);
        setPayables((current) =>
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
    [accessToken, businessId, debouncedSearch, router, statusFilter],
  );

  useEffect(() => {
    void loadPayables({ pageToLoad: 1, replace: true });
  }, [loadPayables]);

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
        <Text style={styles.emptyTitle}>No payables found</Text>
        <Text style={styles.emptySubtitle}>
          Purchases with outstanding balances appear here.
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
          <Text style={styles.title}>Payables</Text>
          <Text style={styles.subtitle}>{currentBusiness?.name}</Text>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by supplier name"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.filterRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStatusFilter("all")}
            style={[
              styles.filterChip,
              statusFilter === "all" && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === "all" && styles.filterChipTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>
          {PAYABLE_STATUSES.map((entry) => (
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

        <FormMessage message={errorMessage} type="error" />

        <FlatList
          data={payables}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(payableDetailHref(item.id))}
              style={({ pressed }) => [
                styles.payableCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.payableHeader}>
                <Text style={styles.supplierName}>{item.supplier.name}</Text>
                <Text style={styles.outstanding}>
                  {formatMoneyDisplay(item.outstandingAmount)}
                </Text>
              </View>
              <Text style={styles.metaText}>
                Purchase: {item.purchaseNumber}
              </Text>
              <View style={styles.payableFooter}>
                <Text style={styles.statusText}>
                  {formatPayableStatus(item.status)}
                </Text>
                <Text style={styles.dateText}>
                  {formatSupplierDateTime(item.createdAt)}
                </Text>
              </View>
            </Pressable>
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={listEmptyComponent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() =>
                void loadPayables({ pageToLoad: 1, replace: true, refreshing: true })
              }
            />
          }
          onEndReached={() => {
            if (!isLoadingMore && hasMore) {
              void loadPayables({ pageToLoad: page + 1, replace: false });
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
    paddingBottom: 16,
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
  searchInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
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
  payableCard: {
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
  payableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  supplierName: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  outstanding: {
    fontSize: 16,
    fontWeight: "700",
    color: "#DC2626",
  },
  metaText: {
    fontSize: 14,
    color: "#64748B",
  },
  payableFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  dateText: {
    fontSize: 13,
    color: "#64748B",
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
