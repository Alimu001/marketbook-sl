import { useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { getSaleReceipt, getSaleReceiptHtml } from "@/api/sales";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { salesHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import {
  formatPaymentMethod,
  formatSaleDateTime,
  formatSalePaymentStatus,
  type SaleReceipt,
} from "@/sales";

function getReceiptActionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return getUserFacingErrorMessage(error);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to prepare the receipt. Please try again.";
}

export default function SaleReceiptScreen() {
  const router = useRouter();
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<"print" | "share" | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string>();

  const businessId = currentBusiness?.id;

  const loadReceipt = useCallback(async () => {
    if (!accessToken || !businessId || !saleId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      setReceipt(await getSaleReceipt(accessToken, businessId, saleId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }

      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, businessId, router, saleId]);

  useEffect(() => {
    void loadReceipt();
  }, [loadReceipt]);

  const loadPrintableHtml = useCallback(async () => {
    if (!accessToken || !businessId || !saleId) {
      throw new Error("Receipt context is unavailable.");
    }

    return getSaleReceiptHtml(accessToken, businessId, saleId);
  }, [accessToken, businessId, saleId]);

  const printReceipt = useCallback(async () => {
    setActiveAction("print");
    setErrorMessage(undefined);

    try {
      const html = await loadPrintableHtml();
      await Print.printAsync({ html });
    } catch (error) {
      setErrorMessage(getReceiptActionErrorMessage(error));
    } finally {
      setActiveAction(null);
    }
  }, [loadPrintableHtml]);

  const shareReceipt = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Sharing unavailable",
        "PDF sharing is available in the Android and iOS app.",
      );
      return;
    }

    setActiveAction("share");
    setErrorMessage(undefined);

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error("Sharing is not available on this device.");
      }

      const html = await loadPrintableHtml();
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        dialogTitle: `Share receipt ${receipt?.receiptNumber ?? ""}`.trim(),
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
      });
    } catch (error) {
      setErrorMessage(getReceiptActionErrorMessage(error));
    } finally {
      setActiveAction(null);
    }
  }, [loadPrintableHtml, receipt?.receiptNumber]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!receipt) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.pagePadding}>
          <FormMessage message={errorMessage ?? "Receipt not found."} />
          <FormButton label="Back to Sales" onPress={() => router.push(salesHref)} />
        </View>
      </SafeAreaView>
    );
  }

  const isBusy = activeAction !== null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {receipt.status === "VOIDED" ? (
          <View style={styles.statusBanner}>
            <Text style={styles.statusBannerText}>VOIDED</Text>
          </View>
        ) : null}

        <Text style={styles.brand}>MarketBook SL</Text>
        <Text style={styles.businessName}>{receipt.business.name}</Text>
        {receipt.business.address ? (
          <Text style={styles.muted}>{receipt.business.address}</Text>
        ) : null}
        {receipt.business.phone ? (
          <Text style={styles.muted}>{receipt.business.phone}</Text>
        ) : null}
        {receipt.business.email ? (
          <Text style={styles.muted}>{receipt.business.email}</Text>
        ) : null}
        <Text style={styles.receiptNumber}>{receipt.receiptNumber}</Text>
        <Text style={styles.muted}>{formatSaleDateTime(receipt.soldAt)}</Text>

        <View style={styles.divider} />
        <Text style={styles.meta}>Customer: {receipt.customerName ?? "Walk-in customer"}</Text>
        <Text style={styles.meta}>Served by: {receipt.servedBy}</Text>

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Items</Text>
        {receipt.items.map((item, index) => (
          <View key={`${item.productId}-${index}`} style={styles.itemRow}>
            <View style={styles.flex}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.muted}>
                {item.quantity} {item.unit} × {formatMoneyDisplay(item.unitPrice)}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{formatMoneyDisplay(item.lineTotal)}</Text>
          </View>
        ))}

        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatMoneyDisplay(receipt.subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Discount</Text>
          <Text style={styles.summaryValue}>
            {formatMoneyDisplay(receipt.discountAmount)}
          </Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatMoneyDisplay(receipt.totalAmount)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Paid</Text>
          <Text style={styles.summaryValue}>{formatMoneyDisplay(receipt.amountPaid)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Balance due</Text>
          <Text style={styles.summaryValue}>
            {formatMoneyDisplay(receipt.outstandingAmount)}
          </Text>
        </View>
        <Text style={styles.meta}>
          {formatSalePaymentStatus(receipt.paymentStatus)} · {formatPaymentMethod(receipt.paymentMethod)}
        </Text>

        {receipt.footer ? (
          <Text style={styles.footerText}>{receipt.footer}</Text>
        ) : null}

        {errorMessage ? <FormMessage message={errorMessage} /> : null}

        <View style={styles.actions}>
          <FormButton
            label={activeAction === "print" ? "Opening Print…" : "Print Receipt"}
            disabled={isBusy}
            onPress={() => void printReceipt()}
          />
          <FormButton
            label={activeAction === "share" ? "Preparing PDF…" : "Share PDF"}
            variant="secondary"
            disabled={isBusy}
            onPress={() => void shareReceipt()}
          />
          <FormButton
            label="Back to Sale"
            variant="secondary"
            disabled={isBusy}
            onPress={() => router.back()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  pagePadding: { flex: 1, padding: 24, gap: 16 },
  content: { paddingHorizontal: 24, paddingBottom: 40, gap: 8 },
  brand: { marginTop: 16, color: "#0F766E", fontSize: 15, fontWeight: "700" },
  businessName: { color: "#0F172A", fontSize: 26, fontWeight: "800" },
  receiptNumber: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  muted: { color: "#64748B", fontSize: 14 },
  meta: { color: "#475569", fontSize: 15, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 12 },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "700" },
  itemRow: { flexDirection: "row", gap: 12, paddingVertical: 8 },
  flex: { flex: 1, gap: 3 },
  itemName: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  itemTotal: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  summaryLabel: { color: "#475569", fontSize: 16 },
  summaryValue: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  totalRow: { borderTopWidth: 2, borderTopColor: "#0F172A", paddingTop: 10, marginTop: 4 },
  totalLabel: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  totalValue: { color: "#0F766E", fontSize: 20, fontWeight: "800" },
  actions: { marginTop: 20, gap: 10 },
  statusBanner: { marginTop: 8, padding: 12, borderRadius: 8, backgroundColor: "#FEE2E2" },
  statusBannerText: { textAlign: "center", color: "#B91C1C", fontWeight: "800" },
  footerText: {
    marginTop: 16,
    textAlign: "center",
    color: "#475569",
    fontSize: 14,
    fontStyle: "italic",
  },
});
