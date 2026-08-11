import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getInventory } from "@/api/inventory";
import { getProduct } from "@/api/products";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import {
  inventoryAdjustHref,
  inventoryHistoryHref,
  inventoryHref,
  inventoryOpeningHref,
  inventoryThresholdHref,
} from "@/navigation/hrefs";
import {
  canAdjustInventory,
  canInitializeOpeningStock,
  canUpdateThreshold,
  canViewInventoryHistory,
  formatQuantityWithUnit,
  type InventoryBalance,
} from "@/inventory";
import type { Product } from "@/products/types";
import { formatDateDisplay } from "@/products/money";

export default function InventoryDetailScreen() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [product, setProduct] = useState<Product | null>(null);
  const [inventory, setInventory] = useState<InventoryBalance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const role = currentBusiness?.role;

  const loadData = useCallback(async () => {
    if (!accessToken || !currentBusiness || !productId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const [productData, inventoryData] = await Promise.all([
        getProduct(accessToken, currentBusiness.id, productId),
        getInventory(accessToken, currentBusiness.id, productId),
      ]);
      setProduct(productData);
      setInventory(inventoryData);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/(auth)/login");
        return;
      }

      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, currentBusiness, logout, productId, router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!product || !inventory || !productId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <FormMessage message={errorMessage ?? "Inventory not found."} type="error" />
          <FormButton label="Back to Inventory" onPress={() => router.replace(inventoryHref)} />
        </View>
      </SafeAreaView>
    );
  }

  const showOpening =
    role && canInitializeOpeningStock(role) && !inventory.hasOpeningStock;
  const showAdjust = role && canAdjustInventory(role) && inventory.hasOpeningStock;
  const showThreshold = role && canUpdateThreshold(role);
  const showHistory = role && canViewInventoryHistory(role);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>

        <Text style={styles.title}>{product.name}</Text>
        <Text style={styles.subtitle}>Inventory Details</Text>

        <FormMessage message={errorMessage} type="error" />

        <View style={styles.details}>
          <DetailRow
            label="Current Stock"
            value={formatQuantityWithUnit(inventory.quantity, product.unit)}
          />
          <DetailRow
            label="Low-stock Threshold"
            value={inventory.lowStockThreshold}
          />
          <DetailRow
            label="Low-stock State"
            value={inventory.isLowStock ? "Low Stock" : "OK"}
          />
          <DetailRow
            label="Last Updated"
            value={formatDateDisplay(inventory.updatedAt)}
          />
        </View>

        <View style={styles.actions}>
          {showOpening ? (
            <FormButton
              label="Set Opening Stock"
              onPress={() => router.push(inventoryOpeningHref(productId))}
            />
          ) : null}

          {showAdjust ? (
            <FormButton
              label="Adjust Stock"
              onPress={() => router.push(inventoryAdjustHref(productId))}
            />
          ) : null}

          {showThreshold ? (
            <FormButton
              label="Change Threshold"
              variant="secondary"
              onPress={() => router.push(inventoryThresholdHref(productId))}
            />
          ) : null}

          {showHistory ? (
            <FormButton
              label="View History"
              variant="secondary"
              onPress={() => router.push(inventoryHistoryHref(productId))}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  content: { paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
  backLink: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 8,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 16, color: "#64748B" },
  details: { gap: 12, marginTop: 8 },
  detailRow: { gap: 4 },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: { fontSize: 16, color: "#0F172A", lineHeight: 22 },
  actions: { gap: 12, marginTop: 16 },
});
