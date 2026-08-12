import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import { listPurchases } from "@/api/purchases";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { purchaseDetailHref, purchaseNewHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import {
  formatPurchasePaymentStatus,
  formatSupplierDateTime,
  type PurchaseListItem,
} from "@/suppliers";

const PAGE_SIZE = 20;

export default function PurchasesListScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [items, setItems] = useState<PurchaseListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;
  const hasMore = items.length < total;

  const loadPurchases = useCallback(
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
        const response = await listPurchases(accessToken, businessId, {
          page: options.pageToLoad,
          limit: PAGE_SIZE,
        });

        setTotal(response.total);
        setPage(response.page);
        setItems((current) =>
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
    [accessToken, businessId, router],
  );

  useEffect(() => {
    void loadPurchases({ pageToLoad: 1, replace: true });
  }, [loadPurchases]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Purchases</Text>
          <FormButton
            label="New Purchase"
            onPress={() => router.push(purchaseNewHref)}
          />
        </View>

        {errorMessage ? <FormMessage type="error" message={errorMessage} /> : null}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0F766E" />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() =>
                  void loadPurchases({ pageToLoad: 1, replace: true, refreshing: true })
                }
              />
            }
            onEndReached={() => {
              if (!isLoadingMore && hasMore) {
                void loadPurchases({ pageToLoad: page + 1, replace: false });
              }
            }}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No purchases yet. Record your first purchase.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(purchaseDetailHref(item.id))}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.purchaseNumber}>{item.purchaseNumber}</Text>
                  <Text style={styles.totalAmount}>
                    {formatMoneyDisplay(item.totalAmount)}
                  </Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.metaText}>{item.supplier.name}</Text>
                  <Text style={styles.metaText}>{item.itemCount} items</Text>
                </View>
                <View style={styles.paymentSummary}>
                  <Text style={styles.summaryText}>
                    Paid {formatMoneyDisplay(item.amountPaid)}
                  </Text>
                  {item.paymentStatus !== "PAID" ? (
                    <Text style={styles.balanceText}>
                      Due {formatMoneyDisplay(item.outstandingAmount)}
                    </Text>
                  ) : (
                    <Text style={styles.summaryText}>
                      {formatPurchasePaymentStatus(item.paymentStatus)}
                    </Text>
                  )}
                </View>
                <Text style={styles.dateText}>
                  {formatSupplierDateTime(item.createdAt)}
                </Text>
              </Pressable>
            )}
            ListFooterComponent={
              isLoadingMore ? (
                <ActivityIndicator style={styles.footerLoader} color="#0F766E" />
              ) : null
            }
            contentContainerStyle={styles.listContent}
          />
        )}
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
    paddingBottom: 24,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0F172A",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  row: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 12,
  },
  rowPressed: {
    opacity: 0.92,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  purchaseNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    flex: 1,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F766E",
  },
  rowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  metaText: {
    fontSize: 14,
    color: "#475569",
    fontWeight: "600",
  },
  paymentSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  summaryText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
  balanceText: {
    fontSize: 13,
    color: "#DC2626",
    fontWeight: "700",
  },
  dateText: {
    marginTop: 8,
    fontSize: 13,
    color: "#64748B",
  },
  emptyText: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 16,
    marginTop: 48,
  },
  footerLoader: {
    marginVertical: 16,
  },
});
