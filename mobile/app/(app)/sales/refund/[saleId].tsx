import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createSaleRefund,
  getSaleReversalSummary,
  type SaleReversalSummary,
} from "@/api/reversals";
import { getSale } from "@/api/sales";
import { REFUND_DESTINATIONS, type RefundDestination } from "@/api/wallet";
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
import { saleDetailHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import { canCreateSaleRefund } from "@/reversals/permissions";

export default function SaleRefundScreen() {
  const router = useRouter();
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [summary, setSummary] = useState<SaleReversalSummary | null>(null);
  const [hasCustomer, setHasCustomer] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [restockMap, setRestockMap] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [refundDestination, setRefundDestination] =
    useState<RefundDestination>("CASH");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;
  const role = currentBusiness?.role;
  const canRefund = role ? canCreateSaleRefund(role) : false;

  const loadSummary = useCallback(async () => {
    if (!accessToken || !businessId || !saleId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const [data, sale] = await Promise.all([
        getSaleReversalSummary(accessToken, businessId, saleId),
        getSale(accessToken, businessId, saleId),
      ]);
      setSummary(data);
      setHasCustomer(Boolean(sale.customer));
      const initialQuantities: Record<string, string> = {};
      const initialRestock: Record<string, boolean> = {};
      for (const item of data.items) {
        initialQuantities[item.saleItemId] = "";
        initialRestock[item.saleItemId] = true;
      }
      setQuantities(initialQuantities);
      setRestockMap(initialRestock);
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
    void loadSummary();
  }, [loadSummary]);

  const previewTotal = useMemo(() => {
    if (!summary) {
      return "0.00";
    }

    let total = 0;

    for (const item of summary.items) {
      const qty = quantities[item.saleItemId]?.trim();
      if (!qty || Number(qty) <= 0) {
        continue;
      }

      const perUnit = Number(item.estimatedLineRefundPerUnit);
      total += perUnit * Number(qty);
    }

    return total.toFixed(2);
  }, [summary, quantities]);

  async function handleSubmit() {
    if (!accessToken || !businessId || !saleId || !summary) {
      return;
    }

    const items = summary.items
      .map((item) => ({
        saleItemId: item.saleItemId,
        quantity: quantities[item.saleItemId]?.trim() ?? "",
        restock: restockMap[item.saleItemId] ?? true,
      }))
      .filter((item) => item.quantity && Number(item.quantity) > 0);

    if (items.length === 0) {
      setErrorMessage("Enter a refund quantity for at least one item.");
      return;
    }

    if (!reason.trim()) {
      setErrorMessage("A reason is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(undefined);

    try {
      await createSaleRefund(accessToken, businessId, saleId, {
        items,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        refundDestination,
      });
      router.replace(`${saleDetailHref(saleId)}?refunded=1` as never);
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

  if (!canRefund) {
    return (
      <AuthScreen title="Refund Sale">
        <FormMessage
          type="error"
          message="You do not have permission to process refunds."
        />
        <FormButton
          label="Back"
          onPress={() => router.back()}
        />
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
          <FormMessage type="error" message={errorMessage ?? "Unable to load sale."} />
          <FormButton label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Refund Items</Text>
        <Text style={styles.subtitle}>
          Remaining refundable: {formatMoneyDisplay(summary.remainingRefundableAmount)}
        </Text>

        {summary.items.map((item) => (
          <View key={item.saleItemId} style={styles.itemCard}>
            <Text style={styles.itemName}>{item.productNameSnapshot}</Text>
            <Text style={styles.itemMeta}>
              Sold: {formatQuantityDisplay(item.soldQuantity)} · Refunded:{" "}
              {formatQuantityDisplay(item.refundedQuantity)} · Refundable:{" "}
              {formatQuantityDisplay(item.refundableQuantity)}
            </Text>
            <FormField
              label="Refund quantity"
              value={quantities[item.saleItemId] ?? ""}
              onChangeText={(value) =>
                setQuantities((current) => ({
                  ...current,
                  [item.saleItemId]: value,
                }))
              }
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <View style={styles.restockRow}>
              <Text style={styles.restockLabel}>Restock inventory</Text>
              <Switch
                value={restockMap[item.saleItemId] ?? true}
                onValueChange={(value) =>
                  setRestockMap((current) => ({
                    ...current,
                    [item.saleItemId]: value,
                  }))
                }
              />
            </View>
          </View>
        ))}

        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Estimated refund (preview)</Text>
          <Text style={styles.previewValue}>NLe {previewTotal}</Text>
          <Text style={styles.previewHint}>
            Final amount is calculated by the server.
          </Text>
        </View>

        <FormField
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="Customer returned item"
        />
        <FormField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Additional details"
        />

        <Text style={styles.sectionLabel}>Return via</Text>
        <View style={styles.methodRow}>
          {REFUND_DESTINATIONS.filter(
            (method) => method.value !== "WALLET" || hasCustomer,
          ).map((method) => (
            <Pressable
              key={method.value}
              style={[
                styles.methodChip,
                refundDestination === method.value && styles.methodChipActive,
              ]}
              onPress={() => setRefundDestination(method.value)}
            >
              <Text
                style={[
                  styles.methodChipText,
                  refundDestination === method.value &&
                    styles.methodChipTextActive,
                ]}
              >
                {method.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {refundDestination === "WALLET" ? (
          <Text style={styles.previewHint}>
            Excess refund beyond outstanding receivable will be added as store credit.
          </Text>
        ) : null}

        {errorMessage ? <FormMessage type="error" message={errorMessage} /> : null}

        <FormButton
          label={isSubmitting ? "Processing..." : "Process Refund"}
          onPress={() => void handleSubmit()}
          disabled={isSubmitting}
        />
        <FormButton
          label="Cancel"
          variant="secondary"
          onPress={() => router.back()}
        />
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
  restockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  restockLabel: { fontSize: 15, fontWeight: "600", color: "#475569" },
  previewCard: {
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  previewLabel: { fontSize: 14, color: "#047857", fontWeight: "600" },
  previewValue: { fontSize: 22, fontWeight: "700", color: "#065F46" },
  previewHint: { fontSize: 12, color: "#047857" },
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
