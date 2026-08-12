import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  listExpenseCategories,
  listExpenses,
} from "@/api/expenses";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import {
  canCreateExpense,
  canManageExpenseCategories,
  formatExpenseDateDisplay,
  type ExpenseCategorySummary,
  type ExpenseFilter,
  type ExpenseListItem,
} from "@/expenses";
import {
  appHref,
  expenseCategoriesHref,
  expenseCreateHref,
  expenseDetailHref,
} from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import { useDebouncedValue } from "@/products/useDebouncedValue";
import { PAYMENT_METHODS, formatPaymentMethod, type PaymentMethod } from "@/sales";

const PAGE_SIZE = 20;

const ARCHIVE_FILTERS: Array<{ key: ExpenseFilter; label: string }> = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
];

function archiveFilterToQuery(filter: ExpenseFilter): boolean | undefined {
  if (filter === "active") {
    return false;
  }

  if (filter === "archived") {
    return true;
  }

  return undefined;
}

export default function ExpenseListScreen() {
  const router = useRouter();
  const { created } = useLocalSearchParams<{ created?: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [expenses, setExpenses] = useState<ExpenseListItem[]>([]);
  const [categories, setCategories] = useState<ExpenseCategorySummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ExpenseFilter>("active");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod | undefined>();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>(
    created ? "Expense recorded successfully." : undefined,
  );

  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const businessId = currentBusiness?.id;
  const role = currentBusiness?.role;
  const canCreate = role ? canCreateExpense(role) : false;
  const canManageCategories = role ? canManageExpenseCategories(role) : false;
  const hasMore = expenses.length < total;

  const loadCategories = useCallback(async () => {
    if (!accessToken || !businessId) {
      return;
    }

    try {
      const response = await listExpenseCategories(accessToken, businessId);
      setCategories(response);
    } catch {
      // Categories are optional for list rendering.
    }
  }, [accessToken, businessId]);

  const loadExpenses = useCallback(
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
        const response = await listExpenses(accessToken, businessId, {
          page: options.pageToLoad,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
          isArchived: archiveFilterToQuery(archiveFilter),
          categoryId: categoryFilter,
          paymentMethod: paymentFilter,
          from: fromDate.trim() || undefined,
          to: toDate.trim() || undefined,
        });

        setTotal(response.total);
        setPage(response.page);
        setExpenses((current) =>
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
    [
      accessToken,
      archiveFilter,
      businessId,
      categoryFilter,
      debouncedSearch,
      fromDate,
      paymentFilter,
      router,
      toDate,
    ],
  );

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadExpenses({ pageToLoad: 1, replace: true });
  }, [loadExpenses]);

  useFocusEffect(
    useCallback(() => {
      if (created) {
        setSuccessMessage("Expense recorded successfully.");
      }
    }, [created]),
  );

  const handleRefresh = () => {
    void loadCategories();
    void loadExpenses({ pageToLoad: 1, replace: true, refreshing: true });
  };

  const handleLoadMore = () => {
    if (isLoading || isRefreshing || isLoadingMore || !hasMore) {
      return;
    }

    void loadExpenses({ pageToLoad: page + 1, replace: false });
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
        <Text style={styles.emptyTitle}>No expenses yet</Text>
        <Text style={styles.emptySubtitle}>
          Record business expenses such as rent, transport, and utilities.
        </Text>
        {canCreate ? (
          <FormButton
            label="+ Add Expense"
            onPress={() => router.push(expenseCreateHref)}
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
          <Text style={styles.title}>Expenses</Text>
          <Text style={styles.subtitle}>{currentBusiness?.name}</Text>
          {canManageCategories ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(expenseCategoriesHref)}
            >
              <Text style={styles.manageLink}>Manage Categories</Text>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search description, vendor, reference, category"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.filterRow}>
          {ARCHIVE_FILTERS.map((entry) => (
            <Pressable
              key={entry.key}
              accessibilityRole="button"
              onPress={() => setArchiveFilter(entry.key)}
              style={[
                styles.filterChip,
                archiveFilter === entry.key && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  archiveFilter === entry.key && styles.filterChipTextActive,
                ]}
              >
                {entry.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowFilters((current) => !current)}
            style={styles.filterToggle}
          >
            <Text style={styles.filterToggleText}>
              {showFilters ? "Hide Filters" : "More Filters"}
            </Text>
          </Pressable>
        </View>

        {showFilters ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.moreFilters}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCategoryFilter(undefined)}
              style={[
                styles.filterChip,
                categoryFilter === undefined && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  categoryFilter === undefined && styles.filterChipTextActive,
                ]}
              >
                All Categories
              </Text>
            </Pressable>
            {categories.map((category) => (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                onPress={() => setCategoryFilter(category.id)}
                style={[
                  styles.filterChip,
                  categoryFilter === category.id && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    categoryFilter === category.id && styles.filterChipTextActive,
                  ]}
                >
                  {category.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {showFilters ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.moreFilters}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPaymentFilter(undefined)}
              style={[
                styles.filterChip,
                paymentFilter === undefined && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  paymentFilter === undefined && styles.filterChipTextActive,
                ]}
              >
                All Payments
              </Text>
            </Pressable>
            {PAYMENT_METHODS.map((method) => (
              <Pressable
                key={method.value}
                accessibilityRole="button"
                onPress={() => setPaymentFilter(method.value)}
                style={[
                  styles.filterChip,
                  paymentFilter === method.value && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    paymentFilter === method.value && styles.filterChipTextActive,
                  ]}
                >
                  {method.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {showFilters ? (
          <View style={styles.dateRow}>
            <TextInput
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="From YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              style={styles.dateInput}
              autoCapitalize="none"
            />
            <TextInput
              value={toDate}
              onChangeText={setToDate}
              placeholder="To YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              style={styles.dateInput}
              autoCapitalize="none"
            />
          </View>
        ) : null}

        <FormMessage message={successMessage} type="success" />
        <FormMessage message={errorMessage} type="error" />

        <FlatList
          data={expenses}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(expenseDetailHref(item.id))}
              style={({ pressed }) => [
                styles.expenseCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.expenseHeader}>
                <Text style={styles.categoryName}>{item.category.name}</Text>
                <Text style={styles.amountText}>
                  {formatMoneyDisplay(item.amount)}
                </Text>
              </View>
              {item.vendorOrPayee ? (
                <Text style={styles.vendorText}>{item.vendorOrPayee}</Text>
              ) : null}
              <Text style={styles.dateText}>
                {formatExpenseDateDisplay(item.expenseDate)}
              </Text>
              <Text style={styles.descriptionText}>{item.description}</Text>
              <Text style={styles.metaText}>
                {formatPaymentMethod(item.paymentMethod)}
                {item.isArchived ? " · Archived" : ""}
              </Text>
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

        {canCreate && expenses.length > 0 ? (
          <View style={styles.footerAction}>
            <FormButton
              label="Add Expense"
              onPress={() => router.push(expenseCreateHref)}
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
  manageLink: {
    color: "#0F766E",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
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
    alignItems: "center",
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
  filterToggle: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  filterToggleText: {
    color: "#0F766E",
    fontSize: 14,
    fontWeight: "700",
  },
  moreFilters: {
    marginBottom: 12,
    maxHeight: 44,
  },
  dateRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  expenseCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 16,
    marginBottom: 12,
    gap: 4,
  },
  cardPressed: {
    opacity: 0.92,
  },
  expenseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  categoryName: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  amountText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F766E",
  },
  vendorText: {
    fontSize: 14,
    color: "#64748B",
  },
  dateText: {
    fontSize: 14,
    color: "#475569",
    fontWeight: "600",
  },
  descriptionText: {
    fontSize: 15,
    color: "#334155",
    marginTop: 4,
  },
  metaText: {
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
  footerAction: {
    paddingBottom: 16,
  },
  footerLoader: {
    paddingVertical: 16,
  },
});
