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
import { listSales } from "@/api/sales";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { formatMoneyDisplay } from "@/products/money";
import { saleDetailHref, saleNewHref } from "@/navigation/hrefs";
import {
  formatPaymentMethod,
  formatSaleDateTime,
  type SaleListItem,
} from "@/sales";

const PAGE_SIZE = 20;

export default function SalesListScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [items, setItems] = useState<SaleListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;
  const hasMore = items.length < total;

  const loadSales = useCallback(
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
        const response = await listSales(accessToken, businessId, {
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
    void loadSales({ pageToLoad: 1, replace: true });
  }, [loadSales]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Sales</Text>
          <FormButton
            label="New Sale"
            onPress={() => router.push(saleNewHref)}
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
                  void loadSales({ pageToLoad: 1, replace: true, refreshing: true })
                }
              />
            }
            onEndReached={() => {
              if (!isLoadingMore && hasMore) {
                void loadSales({ pageToLoad: page + 1, replace: false });
              }
            }}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No sales yet. Create your first sale.</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(saleDetailHref(item.id))}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.receiptNumber}>{item.receiptNumber}</Text>
                  <Text style={styles.totalAmount}>
                    {formatMoneyDisplay(item.totalAmount)}
                  </Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.metaText}>
                    {formatPaymentMethod(item.paymentMethod)}
                  </Text>
                  <Text style={styles.metaText}>{item.itemCount} items</Text>
                </View>
                <Text style={styles.dateText}>
                  {formatSaleDateTime(item.createdAt)}
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
  receiptNumber: {
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
