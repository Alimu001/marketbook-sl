import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSale } from "@/api/sales";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { formatQuantityDisplay } from "@/inventory/quantity";
import { formatMoneyDisplay } from "@/products/money";
import { saleNewHref, salesHref } from "@/navigation/hrefs";
import {
  formatPaymentMethod,
  formatSaleDateTime,
  type SaleDetail,
} from "@/sales";

export default function SaleDetailScreen() {
  const router = useRouter();
  const { saleId, completed } = useLocalSearchParams<{
    saleId: string;
    completed?: string;
  }>();
  const { accessToken, user } = useAuth();
  const { currentBusiness } = useBusiness();

  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;

  const loadSale = useCallback(async () => {
    if (!accessToken || !businessId || !saleId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const detail = await getSale(accessToken, businessId, saleId);
      setSale(detail);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }

      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, businessId, saleId, router]);

  useEffect(() => {
    void loadSale();
  }, [loadSale]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!sale) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <FormMessage type="error" message={errorMessage ?? "Sale not found."} />
          <FormButton label="Back to Sales" onPress={() => router.push(salesHref)} />
        </View>
      </SafeAreaView>
    );
  }

  const servedByName =
    sale.createdBy.name ?? user?.name ?? sale.createdBy.email;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {completed === "1" ? (
          <FormMessage
            type="success"
            message="Sale completed successfully."
          />
        ) : null}

        <Text style={styles.brand}>MarketBook SL</Text>
        <Text style={styles.businessName}>{currentBusiness?.name}</Text>
        <Text style={styles.receiptLine}>Receipt: {sale.receiptNumber}</Text>
        <Text style={styles.dateLine}>{formatSaleDateTime(sale.createdAt)}</Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Items</Text>
        {sale.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.productNameSnapshot}</Text>
            <Text style={styles.itemDetail}>
              {formatQuantityDisplay(item.quantity)} × {formatMoneyDisplay(item.unitPrice)}
            </Text>
            <Text style={styles.itemTotal}>
              {formatMoneyDisplay(item.lineSubtotal)}
            </Text>
          </View>
        ))}

        <View style={styles.divider} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatMoneyDisplay(sale.subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Discount</Text>
          <Text style={styles.summaryValue}>
            {formatMoneyDisplay(sale.discountAmount)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalValue}>{formatMoneyDisplay(sale.totalAmount)}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.metaLine}>
          Payment: {formatPaymentMethod(sale.paymentMethod)}
        </Text>
        <Text style={styles.metaLine}>Served by: {servedByName}</Text>

        <View style={styles.actions}>
          <FormButton label="Back to Sales" onPress={() => router.push(salesHref)} />
          <FormButton
            label="New Sale"
            variant="secondary"
            onPress={() => router.push(saleNewHref)}
          />
        </View>
      </ScrollView>
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
    padding: 24,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 8,
  },
  brand: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "700",
    color: "#0F766E",
  },
  businessName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
  },
  receiptLine: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0F172A",
  },
  dateLine: {
    fontSize: 14,
    color: "#64748B",
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  itemRow: {
    marginBottom: 12,
    gap: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  itemDetail: {
    fontSize: 14,
    color: "#475569",
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F766E",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 16,
    color: "#475569",
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F766E",
  },
  metaLine: {
    fontSize: 15,
    color: "#475569",
    fontWeight: "600",
  },
  actions: {
    marginTop: 16,
    gap: 12,
  },
});
