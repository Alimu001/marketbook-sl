import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
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
import { listProducts } from "@/api/products";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import {
  productCreateHref,
  productDetailHref,
  appHref,
} from "@/navigation/hrefs";
import {
  canCreateProduct,
  formatProductPrice,
  type Product,
  type ProductFilter,
} from "@/products";
import { useDebouncedValue } from "@/products/useDebouncedValue";

const PAGE_SIZE = 20;

const FILTERS: Array<{ key: ProductFilter; label: string }> = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

function filterToQuery(filter: ProductFilter): boolean | undefined {
  if (filter === "active") {
    return true;
  }

  if (filter === "archived") {
    return false;
  }

  return undefined;
}

export default function ProductListScreen() {
  const router = useRouter();
  const { created } = useLocalSearchParams<{ created?: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("active");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>(
    created ? "Product created successfully." : undefined,
  );

  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const businessId = currentBusiness?.id;
  const role = currentBusiness?.role;
  const canCreate = role ? canCreateProduct(role) : false;
  const hasMore = products.length < total;

  const loadProducts = useCallback(
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
        const response = await listProducts(accessToken, businessId, {
          page: options.pageToLoad,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
          isActive: filterToQuery(filter),
        });

        setTotal(response.total);
        setPage(response.page);
        setProducts((current) =>
          options.replace
            ? response.items
            : [...current, ...response.items],
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
    void loadProducts({ pageToLoad: 1, replace: true });
  }, [loadProducts]);

  useFocusEffect(
    useCallback(() => {
      if (created) {
        setSuccessMessage("Product created successfully.");
      }
    }, [created]),
  );

  const handleRefresh = () => {
    void loadProducts({ pageToLoad: 1, replace: true, refreshing: true });
  };

  const handleLoadMore = () => {
    if (isLoading || isRefreshing || isLoadingMore || !hasMore) {
      return;
    }

    void loadProducts({ pageToLoad: page + 1, replace: false });
  };

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
        <Text style={styles.emptyTitle}>No products yet</Text>
        <Text style={styles.emptySubtitle}>
          Add your first product to start managing your catalog.
        </Text>
        {canCreate ? (
          <FormButton
            label="+ Add Product"
            onPress={() => router.push(productCreateHref)}
          />
        ) : null}
      </View>
    );
  }, [canCreate, isLoading, router]);

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
          <Text style={styles.title}>Products</Text>
          <Text style={styles.subtitle}>{currentBusiness?.name}</Text>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search products, SKU, or barcode"
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

        <FormMessage message={successMessage} type="success" />
        <FormMessage message={errorMessage} type="error" />

        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(productDetailHref(item.id))}
              style={({ pressed }) => [
                styles.productCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.productHeader}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text
                  style={[
                    styles.statusBadge,
                    item.isActive ? styles.statusActive : styles.statusArchived,
                  ]}
                >
                  {item.isActive ? "Active" : "Archived"}
                </Text>
              </View>
              <Text style={styles.productPrice}>
                {formatProductPrice(item.sellingPrice, item.unit)}
              </Text>
              {item.sku ? (
                <Text style={styles.productMeta}>SKU: {item.sku}</Text>
              ) : null}
            </Pressable>
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={listEmptyComponent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color="#0F766E" />
            ) : null
          }
        />

        {canCreate && products.length > 0 ? (
          <View style={styles.footerAction}>
            <FormButton
              label="Add Product"
              onPress={() => router.push(productCreateHref)}
            />
          </View>
        ) : null}
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
  productCard: {
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
  productHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  productName: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  statusActive: {
    backgroundColor: "#DCFCE7",
    color: "#166534",
  },
  statusArchived: {
    backgroundColor: "#F1F5F9",
    color: "#64748B",
  },
  productPrice: {
    fontSize: 16,
    color: "#334155",
    fontWeight: "600",
  },
  productMeta: {
    fontSize: 14,
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
  footerAction: {
    paddingBottom: 16,
  },
  footerLoader: {
    paddingVertical: 16,
  },
});
