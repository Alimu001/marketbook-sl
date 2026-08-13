import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getInventoryHistory } from "@/api/inventory";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormMessage } from "@/components/AuthScreen";
import {
  formatQuantityDisplay,
  formatSignedQuantityChange,
  transactionTypeLabel,
  type InventoryTransaction,
} from "@/inventory";
import { formatDateDisplay } from "@/products/money";

export default function InventoryHistoryScreen() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [items, setItems] = useState<InventoryTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const hasMore = items.length < total;

  const loadHistory = useCallback(
    async (pageToLoad: number, replace: boolean) => {
      if (!accessToken || !currentBusiness || !productId) {
        return;
      }

      if (replace) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await getInventoryHistory(
          accessToken,
          currentBusiness.id,
          productId,
          { page: pageToLoad, limit: 20 },
        );
        setTotal(response.total);
        setPage(response.page);
        setItems((current) =>
          replace ? response.items : [...current, ...response.items],
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/(auth)/login");
          return;
        }
        setErrorMessage(getUserFacingErrorMessage(error));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [accessToken, currentBusiness, productId, router],
  );

  useEffect(() => {
    void loadHistory(1, true);
  }, [loadHistory]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Stock History</Text>

        <FormMessage message={errorMessage} type="error" />

        {isLoading ? (
          <ActivityIndicator size="large" color="#0F766E" />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.type}>{transactionTypeLabel(item.type)}</Text>
                <Text style={styles.change}>
                  {formatSignedQuantityChange(item.quantityChange)}
                </Text>
                <Text style={styles.flow}>
                  {formatQuantityDisplay(item.quantityBefore)} →{" "}
                  {formatQuantityDisplay(item.quantityAfter)}
                </Text>
                {item.reason ? (
                  <Text style={styles.reason}>Reason: {item.reason}</Text>
                ) : null}
                <Text style={styles.date}>
                  {formatDateDisplay(item.createdAt)}
                </Text>
              </View>
            )}
            onEndReached={() => {
              if (!isLoadingMore && hasMore) {
                void loadHistory(page + 1, false);
              }
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isLoadingMore ? (
                <ActivityIndicator style={styles.footerLoader} color="#0F766E" />
              ) : null
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  backLink: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#0F172A", marginBottom: 12 },
  listContent: { paddingBottom: 24, gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 4,
    marginBottom: 12,
  },
  type: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  change: { fontSize: 15, fontWeight: "600", color: "#0F766E" },
  flow: { fontSize: 14, color: "#334155" },
  reason: { fontSize: 14, color: "#64748B" },
  date: { fontSize: 13, color: "#94A3B8" },
  footerLoader: { paddingVertical: 16 },
});
