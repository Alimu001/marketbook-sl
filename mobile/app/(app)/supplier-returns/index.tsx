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
import {
  listSupplierReturns,
  type SupplierReturnListItem,
} from "@/api/supplierReturns";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormMessage } from "@/components/AuthScreen";
import { supplierReturnDetailHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import { formatSupplierDateTime } from "@/suppliers";

export default function SupplierReturnsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [items, setItems] = useState<SupplierReturnListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;

  const loadReturns = useCallback(
    async (refresh = false) => {
      if (!accessToken || !businessId) {
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(undefined);

      try {
        const response = await listSupplierReturns(accessToken, businessId);
        setItems(response.items);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/(auth)/login");
          return;
        }
        setErrorMessage(getUserFacingErrorMessage(error));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, businessId, router],
  );

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadReturns(true)}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Supplier Returns</Text>
            {errorMessage ? <FormMessage type="error" message={errorMessage} /> : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No supplier returns yet.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(supplierReturnDetailHref(item.id))}
          >
            <Text style={styles.returnNumber}>{item.returnNumber}</Text>
            <Text style={styles.supplierName}>{item.supplierName}</Text>
            <Text style={styles.meta}>
              {item.purchaseNumber} · {formatMoneyDisplay(item.returnAmount)}
            </Text>
            <Text style={styles.date}>{formatSupplierDateTime(item.createdAt)}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 24, gap: 12, paddingBottom: 40 },
  header: { gap: 12, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: "700", color: "#0F172A" },
  emptyText: { color: "#64748B", fontSize: 15, textAlign: "center", marginTop: 24 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  returnNumber: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  supplierName: { fontSize: 15, fontWeight: "600", color: "#475569" },
  meta: { fontSize: 14, color: "#0F766E", fontWeight: "600" },
  date: { fontSize: 13, color: "#64748B" },
});
