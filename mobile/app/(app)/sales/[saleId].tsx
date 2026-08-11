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
import {
  getSaleReversalSummary,
  listSaleRefunds,
  type SaleRefundDetail,
  type SaleReversalSummary,
} from "@/api/reversals";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { formatQuantityDisplay } from "@/inventory/quantity";
import { formatMoneyDisplay } from "@/products/money";
import { saleNewHref, saleRefundHref, saleVoidHref, salesHref } from "@/navigation/hrefs";
import {
  canCreateSaleRefund,
  canVoidSale,
} from "@/reversals/permissions";
import {
  formatPaymentMethod,
  formatSaleDateTime,
  formatSalePaymentStatus,
  type SaleDetail,
} from "@/sales";

export default function SaleDetailScreen() {
  const router = useRouter();
  const { saleId, completed, refunded } = useLocalSearchParams<{
    saleId: string;
    completed?: string;
    refunded?: string;
  }>();
  const { accessToken, user } = useAuth();
  const { currentBusiness } = useBusiness();

  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [reversalSummary, setReversalSummary] =
    useState<SaleReversalSummary | null>(null);
  const [refunds, setRefunds] = useState<SaleRefundDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const businessId = currentBusiness?.id;
  const role = currentBusiness?.role;
  const canRefund = role ? canCreateSaleRefund(role) : false;
  const canVoid = role ? canVoidSale(role) : false;

  const loadSale = useCallback(async () => {
    if (!accessToken || !businessId || !saleId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const [detail, summary, refundList] = await Promise.all([
        getSale(accessToken, businessId, saleId),
        getSaleReversalSummary(accessToken, businessId, saleId),
        listSaleRefunds(accessToken, businessId, saleId),
      ]);
      setSale(detail);
      setReversalSummary(summary);
      setRefunds(refundList.refunds);
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
        {refunded === "1" ? (
          <FormMessage type="success" message="Refund completed successfully." />
        ) : null}

        {sale.status === "VOIDED" ? (
          <View style={styles.voidBanner}>
            <Text style={styles.voidBannerText}>VOIDED</Text>
          </View>
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

        {sale.customer ? (
          <Text style={styles.metaLine}>Customer: {sale.customer.name}</Text>
        ) : null}
        <Text style={styles.metaLine}>
          Paid: {formatMoneyDisplay(sale.amountPaid)}
        </Text>
        <Text style={styles.metaLine}>
          Balance Due: {formatMoneyDisplay(sale.outstandingAmount)}
        </Text>
        <Text style={styles.metaLine}>
          Status: {formatSalePaymentStatus(sale.paymentStatus)}
        </Text>
        <Text style={styles.metaLine}>
          Payment: {formatPaymentMethod(sale.paymentMethod)}
        </Text>
        {reversalSummary ? (
          <>
            <Text style={styles.metaLine}>
              Refunded: {formatMoneyDisplay(reversalSummary.refundedAmount)}
            </Text>
            <Text style={styles.metaLine}>
              Remaining refundable:{" "}
              {formatMoneyDisplay(reversalSummary.remainingRefundableAmount)}
            </Text>
          </>
        ) : null}
        <Text style={styles.metaLine}>Served by: {servedByName}</Text>

        {refunds.length > 0 ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Refund History</Text>
            {refunds.map((refund) => (
              <View key={refund.id} style={styles.refundRow}>
                <Text style={styles.refundNumber}>{refund.refundNumber}</Text>
                <Text style={styles.refundAmount}>
                  {formatMoneyDisplay(refund.refundAmount)}
                </Text>
                <Text style={styles.refundReason}>{refund.reason}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.actions}>
          {sale.status === "COMPLETED" && canRefund && reversalSummary &&
          !reversalSummary.isFullyRefunded ? (
            <FormButton
              label="Refund Items"
              onPress={() => router.push(saleRefundHref(saleId))}
            />
          ) : null}
          {sale.status === "COMPLETED" &&
          canVoid &&
          reversalSummary &&
          reversalSummary.refundedAmount === "0.00" ? (
            <FormButton
              label="Void Sale"
              variant="secondary"
              onPress={() => router.push(saleVoidHref(saleId))}
            />
          ) : null}
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
  voidBanner: {
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  voidBannerText: {
    color: "#B91C1C",
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },
  refundRow: {
    marginBottom: 12,
    gap: 2,
  },
  refundNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  refundAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F766E",
  },
  refundReason: {
    fontSize: 14,
    color: "#64748B",
  },
});
