import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createSupplierReturn,
  getPurchaseReturnSummary,
  type PurchaseReturnSummary,
} from "@/api/supplierReturns";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { formatQuantityDisplay } from "@/inventory/quantity";
import { purchaseDetailHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import { canCreateSupplierReturn } from "@/reversals/supplierReturnPermissions";
import { PAYMENT_METHODS, type PaymentMethod } from "@/sales";

export default function PurchaseReturnScreen() {
  const router = useRouter();
  const { purchaseId } = useLocalSearchParams<{ purchaseId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [summary, setSummary] = useState<PurchaseReturnSummary | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [refundPaymentMethod, setRefundPaymentMethod] =
    useState<PaymentMethod>("CASH");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;
  const role = currentBusiness?.role;
  const canReturn = role ? canCreateSupplierReturn(role) : false;

  const loadSummary = useCallback(async () => {
    if (!accessToken || !businessId || !purchaseId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const data = await getPurchaseReturnSummary(
        accessToken,
        businessId,
        purchaseId,
      );
      setSummary(data);
      const initial: Record<string, string> = {};
      for (const item of data.items) {
        initial[item.purchaseItemId] = "";
      }
      setQuantities(initial);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }
      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, businessId, purchaseId, router]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const previewTotal = useMemo(() => {
    if (!summary) {
      return "0.00";
    }

    let total = 0;
    for (const item of summary.items) {
      const qty = quantities[item.purchaseItemId]?.trim();
      if (!qty || Number(qty) <= 0) {
        continue;
      }
      total += Number(item.estimatedLineReturnPerUnit) * Number(qty);
    }
    return total.toFixed(2);
  }, [summary, quantities]);

  async function handleSubmit() {
    if (!accessToken || !businessId || !purchaseId || !summary) {
      return;
    }

    const items = summary.items
      .map((item) => ({
        purchaseItemId: item.purchaseItemId,
        quantity: quantities[item.purchaseItemId]?.trim() ?? "",
      }))
      .filter((item) => item.quantity && Number(item.quantity) > 0);

    if (items.length === 0) {
      setErrorMessage("Enter a return quantity for at least one item.");
      return;
    }

    if (!reason.trim()) {
      setErrorMessage("A reason is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(undefined);

    try {
      await createSupplierReturn(accessToken, businessId, purchaseId, {
        items,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        refundPaymentMethod,
      });
      router.replace(`${purchaseDetailHref(purchaseId)}?returned=1` as never);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }
      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canReturn) {
    return (
      <AuthScreen title="Return to Supplier">
        <FormMessage
          type="error"
          message="You do not have permission to process supplier returns."
        />
        <FormButton label="Back" onPress={() => router.back()} />
      </AuthScreen>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!summary) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <FormMessage type="error" message={errorMessage ?? "Unable to load purchase."} />
          <FormButton label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Return Items to Supplier</Text>
        <Text style={styles.subtitle}>
          Remaining returnable value:{" "}
          {formatMoneyDisplay(summary.remainingReturnableAmount)}
        </Text>

        {summary.items.map((item) => (
          <View key={item.purchaseItemId} style={styles.itemCard}>
            <Text style={styles.itemName}>{item.productNameSnapshot}</Text>
            <Text style={styles.itemMeta}>
              Purchased: {formatQuantityDisplay(item.purchasedQuantity)} · Returned:{" "}
              {formatQuantityDisplay(item.returnedQuantity)} · Historically returnable:{" "}
              {formatQuantityDisplay(item.returnableQuantity)}
            </Text>
            <Text style={styles.itemMeta}>
              Current stock: {formatQuantityDisplay(item.currentStock)} · Max return now:{" "}
              {formatQuantityDisplay(item.maxReturnableNow)}
            </Text>
            <FormField
              label="Return quantity"
              value={quantities[item.purchaseItemId] ?? ""}
              onChangeText={(value) =>
                setQuantities((current) => ({
                  ...current,
                  [item.purchaseItemId]: value,
                }))
              }
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </View>
        ))}

        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Estimated return value (preview)</Text>
          <Text style={styles.previewValue}>NLe {previewTotal}</Text>
          <Text style={styles.previewHint}>
            Payable reduction and cash refund are calculated by the server.
          </Text>
        </View>

        <FormField label="Reason" value={reason} onChangeText={setReason} />
        <FormField label="Notes (optional)" value={notes} onChangeText={setNotes} />

        <Text style={styles.sectionLabel}>Refund method from supplier</Text>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map((method) => (
            <Pressable
              key={method.value}
              style={[
                styles.methodChip,
                refundPaymentMethod === method.value && styles.methodChipActive,
              ]}
              onPress={() => setRefundPaymentMethod(method.value)}
            >
              <Text
                style={[
                  styles.methodChipText,
                  refundPaymentMethod === method.value &&
                    styles.methodChipTextActive,
                ]}
              >
                {method.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {errorMessage ? <FormMessage type="error" message={errorMessage} /> : null}

        <FormButton
          label={isSubmitting ? "Processing..." : "Process Return"}
          onPress={() => void handleSubmit()}
          disabled={isSubmitting}
        />
        <FormButton label="Cancel" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, padding: 24, gap: 16 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { padding: 24, gap: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 15, color: "#64748B", fontWeight: "600" },
  itemCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  itemName: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  itemMeta: { fontSize: 14, color: "#64748B" },
  previewCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  previewLabel: { fontSize: 14, color: "#1D4ED8", fontWeight: "600" },
  previewValue: { fontSize: 22, fontWeight: "700", color: "#1E3A8A" },
  previewHint: { fontSize: 12, color: "#1D4ED8" },
  sectionLabel: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodChip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  methodChipActive: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  methodChipText: { color: "#475569", fontWeight: "600" },
  methodChipTextActive: { color: "#FFFFFF" },
});
