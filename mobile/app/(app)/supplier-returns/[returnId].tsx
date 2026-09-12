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
import {
  getSupplierReturnDetail,
  type SupplierReturnDetail,
} from "@/api/supplierReturns";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { formatQuantityDisplay } from "@/inventory/quantity";
import { formatMoneyDisplay } from "@/products/money";
import { formatPaymentMethod, formatSaleDateTime } from "@/sales";

export default function SupplierReturnDetailScreen() {
  const router = useRouter();
  const { returnId } = useLocalSearchParams<{ returnId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [supplierReturn, setSupplierReturn] =
    useState<SupplierReturnDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;

  const loadReturn = useCallback(async () => {
    if (!accessToken || !businessId || !returnId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const response = await getSupplierReturnDetail(
        accessToken,
        businessId,
        returnId,
      );
      setSupplierReturn(response.supplierReturn);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }
      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, businessId, returnId, router]);

  useEffect(() => {
    void loadReturn();
  }, [loadReturn]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!supplierReturn) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <FormMessage type="error" message={errorMessage ?? "Return not found."} />
          <FormButton label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Supplier Return</Text>
        <Text style={styles.number}>{supplierReturn.returnNumber}</Text>
        <Text style={styles.meta}>
          Return Amount: {formatMoneyDisplay(supplierReturn.returnAmount)}
        </Text>
        <Text style={styles.meta}>
          Payable Reduced: {formatMoneyDisplay(supplierReturn.payableReduction)}
        </Text>
        <Text style={styles.meta}>
          Cash Refunded: {formatMoneyDisplay(supplierReturn.cashRefundAmount)}
        </Text>
        <Text style={styles.meta}>
          Refund Method: {formatPaymentMethod(supplierReturn.refundPaymentMethod)}
        </Text>
        <Text style={styles.meta}>Reason: {supplierReturn.reason}</Text>
        <Text style={styles.meta}>
          Processed: {formatSaleDateTime(supplierReturn.createdAt)}
        </Text>

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Items</Text>
        {supplierReturn.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemQty}>
              {formatQuantityDisplay(item.quantity)} returned
            </Text>
            <Text style={styles.itemAmount}>
              {formatMoneyDisplay(item.lineReturnAmount)}
            </Text>
          </View>
        ))}

        <FormButton label="Back" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, padding: 24, gap: 16 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { padding: 24, gap: 8, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700", color: "#0F172A" },
  number: { fontSize: 16, fontWeight: "700", color: "#0F766E" },
  meta: { fontSize: 15, color: "#475569", fontWeight: "600" },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  itemRow: { marginBottom: 8, gap: 2 },
  itemQty: { fontSize: 15, color: "#0F172A" },
  itemAmount: { fontSize: 14, color: "#0F766E", fontWeight: "700" },
});
