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
import { listInventory } from "@/api/inventory";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormMessage } from "@/components/AuthScreen";
import { appHref, inventoryDetailHref } from "@/navigation/hrefs";
import {
  formatQuantityWithUnit,
  type InventoryFilter,
  type InventoryListItem,
} from "@/inventory";
import { useDebouncedValue } from "@/products/useDebouncedValue";

const PAGE_SIZE = 20;

const FILTERS: Array<{ key: InventoryFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "lowStock", label: "Low Stock" },
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
];

function filterToParams(filter: InventoryFilter): {
  lowStock?: boolean;
  isActive?: boolean;
} {
  switch (filter) {
    case "lowStock":
      return { lowStock: true };
    case "active":
      return { isActive: true };
    case "archived":
      return { isActive: false };
    default:
      return {};
  }
}

export default function InventoryListScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [items, setItems] = useState<InventoryListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const businessId = currentBusiness?.id;
  const hasMore = items.length < total;

  const loadInventory = useCallback(
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
        const response = await listInventory(accessToken, businessId, {
          page: options.pageToLoad,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
          ...filterToParams(filter),
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
    [accessToken, businessId, debouncedSearch, filter, router],
  );

  useEffect(() => {
    void loadInventory({ pageToLoad: 1, replace: true });
  }, [loadInventory]);

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
        <Text style={styles.emptyTitle}>No inventory records yet</Text>
        <Text style={styles.emptySubtitle}>
          Create products first, then set opening stock to track inventory.
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
          <Text style={styles.title}>Inventory</Text>
          <Text style={styles.subtitle}>{currentBusiness?.name}</Text>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search products or SKU"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.filterRow}>
          {FILTERS.map((entry) => (
            <Pressable
              key={entry.key}
              accessibilityRole="button"
              onPress={() => setFilter(entry.key)}
              style={[
                styles.filterChip,
                filter === entry.key && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filter === entry.key && styles.filterChipTextActive,
                ]}
              >
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <FormMessage message={errorMessage} type="error" />

        <FlatList
          data={items}
          keyExtractor={(item) => item.productId}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(inventoryDetailHref(item.productId))}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.productName}>{item.productName}</Text>
                {item.isLowStock ? (
                  <Text style={styles.lowStockBadge}>LOW STOCK</Text>
                ) : (
                  <Text style={styles.inStockBadge}>In Stock</Text>
                )}
              </View>
              {item.sku ? (
                <Text style={styles.meta}>SKU: {item.sku}</Text>
              ) : null}
              <Text style={styles.stockLine}>
                Stock: {formatQuantityWithUnit(item.quantity, item.unit)}
              </Text>
              <Text style={styles.meta}>
                Low stock at: {item.lowStockThreshold}
              </Text>
              <Text style={styles.meta}>
                Status: {item.isActive ? "Active" : "Archived"}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={listEmptyComponent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() =>
                void loadInventory({ pageToLoad: 1, replace: true, refreshing: true })
              }
            />
          }
          onEndReached={() => {
            if (!isLoading && !isRefreshing && !isLoadingMore && hasMore) {
              void loadInventory({ pageToLoad: page + 1, replace: false });
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
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, paddingHorizontal: 24 },
  header: { paddingTop: 8, paddingBottom: 16, gap: 4 },
  backLink: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 15, color: "#64748B" },
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
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  filterChip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  filterChipActive: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  filterChipText: { color: "#475569", fontSize: 14, fontWeight: "600" },
  filterChipTextActive: { color: "#FFFFFF" },
  listContent: { paddingBottom: 24, flexGrow: 1 },
  card: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 16,
    marginBottom: 12,
    gap: 6,
  },
  cardPressed: { opacity: 0.92 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  productName: { flex: 1, fontSize: 18, fontWeight: "700", color: "#0F172A" },
  lowStockBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  inStockBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stockLine: { fontSize: 16, fontWeight: "600", color: "#334155" },
  meta: { fontSize: 14, color: "#64748B" },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#0F172A" },
  emptySubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#64748B",
    textAlign: "center",
  },
  footerLoader: { paddingVertical: 16 },
});
