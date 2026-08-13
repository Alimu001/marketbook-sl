import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getCustomerWallet,
  getWalletHistory,
  manualCreditWallet,
  manualDebitWallet,
  WALLET_TRANSACTION_LABELS,
  type WalletTransaction,
} from "@/api/wallet";
import { getCustomer } from "@/api/customers";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { canManualAdjustWallet } from "@/customers/walletPermissions";
import { formatCustomerDateTime } from "@/customers";
import { customerDetailHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";

export default function CustomerWalletScreen() {
  const router = useRouter();
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [customerName, setCustomerName] = useState("");
  const [balance, setBalance] = useState("0.00");
  const [history, setHistory] = useState<WalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [creditAmount, setCreditAmount] = useState("");
  const [debitAmount, setDebitAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);

  const businessId = currentBusiness?.id;
  const role = currentBusiness?.role;
  const canAdjust = role ? canManualAdjustWallet(role) : false;

  const loadWallet = useCallback(async () => {
    if (!accessToken || !businessId || !customerId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const [customer, wallet, historyResponse] = await Promise.all([
        getCustomer(accessToken, businessId, customerId),
        getCustomerWallet(accessToken, businessId, customerId),
        getWalletHistory(accessToken, businessId, customerId, { limit: 50 }),
      ]);

      setCustomerName(customer.name);
      setBalance(wallet.balance);
      setHistory(historyResponse.items);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }

      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, businessId, customerId, router]);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  async function handleCredit() {
    if (!accessToken || !businessId || !customerId || !canAdjust) {
      return;
    }

    if (!creditAmount.trim() || !adjustReason.trim()) {
      setErrorMessage("Amount and reason are required.");
      return;
    }

    setIsAdjusting(true);
    setErrorMessage(undefined);

    try {
      const wallet = await manualCreditWallet(accessToken, businessId, customerId, {
        amount: creditAmount.trim(),
        reason: adjustReason.trim(),
      });
      setBalance(wallet.balance);
      setCreditAmount("");
      setAdjustReason("");
      await loadWallet();
    } catch (error) {
      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsAdjusting(false);
    }
  }

  async function handleDebit() {
    if (!accessToken || !businessId || !customerId || !canAdjust) {
      return;
    }

    if (!debitAmount.trim() || !adjustReason.trim()) {
      setErrorMessage("Amount and reason are required.");
      return;
    }

    Alert.alert("Debit store credit?", "This reduces the customer's wallet balance.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Debit",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setIsAdjusting(true);
            setErrorMessage(undefined);

            try {
              const wallet = await manualDebitWallet(
                accessToken,
                businessId,
                customerId,
                {
                  amount: debitAmount.trim(),
                  reason: adjustReason.trim(),
                },
              );
              setBalance(wallet.balance);
              setDebitAmount("");
              setAdjustReason("");
              await loadWallet();
            } catch (error) {
              setErrorMessage(getUserFacingErrorMessage(error));
            } finally {
              setIsAdjusting(false);
            }
          })();
        },
      },
    ]);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Customer Wallet</Text>
        <Pressable onPress={() => router.push(customerDetailHref(customerId))}>
          <Text style={styles.customerName}>{customerName}</Text>
        </Pressable>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balanceValue}>{formatMoneyDisplay(balance)}</Text>
        </View>

        <FormMessage message={errorMessage} type="error" />

        {canAdjust ? (
          <View style={styles.adjustSection}>
            <Text style={styles.sectionTitle}>Manual Adjustment</Text>
            <FormField
              label="Reason"
              value={adjustReason}
              onChangeText={setAdjustReason}
            />
            <FormField
              label="Credit Amount"
              value={creditAmount}
              onChangeText={setCreditAmount}
              keyboardType="decimal-pad"
            />
            <FormButton
              label={isAdjusting ? "Saving..." : "Add Credit"}
              disabled={isAdjusting}
              onPress={() => void handleCredit()}
            />
            <FormField
              label="Debit Amount"
              value={debitAmount}
              onChangeText={setDebitAmount}
              keyboardType="decimal-pad"
            />
            <FormButton
              label={isAdjusting ? "Saving..." : "Debit Credit"}
              variant="secondary"
              disabled={isAdjusting}
              onPress={() => void handleDebit()}
            />
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>History</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>No wallet transactions yet.</Text>
        ) : (
          history.map((entry) => (
            <View key={entry.id} style={styles.historyCard}>
              <Text style={styles.historyType}>
                {WALLET_TRANSACTION_LABELS[entry.type]}
              </Text>
              <Text style={styles.historyAmount}>
                {entry.type === "SALE_PAYMENT" || entry.type === "MANUAL_DEBIT"
                  ? `- ${formatMoneyDisplay(entry.amount)}`
                  : `+ ${formatMoneyDisplay(entry.amount)}`}
              </Text>
              <Text style={styles.historyBalance}>
                {formatMoneyDisplay(entry.balanceBefore)} →{" "}
                {formatMoneyDisplay(entry.balanceAfter)}
              </Text>
              {entry.reason ? (
                <Text style={styles.historyMeta}>Reason: {entry.reason}</Text>
              ) : null}
              <Text style={styles.historyMeta}>
                {formatCustomerDateTime(entry.createdAt)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { padding: 24, gap: 12 },
  backLink: { color: "#0F766E", fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "700", color: "#0F172A" },
  customerName: { fontSize: 16, color: "#0F766E", fontWeight: "600" },
  balanceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 4,
  },
  balanceLabel: { fontSize: 14, color: "#64748B" },
  balanceValue: { fontSize: 28, fontWeight: "700", color: "#0F766E" },
  adjustSection: { gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A", marginTop: 8 },
  emptyText: { color: "#64748B" },
  historyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 4,
  },
  historyType: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  historyAmount: { fontSize: 16, fontWeight: "600", color: "#334155" },
  historyBalance: { fontSize: 14, color: "#64748B" },
  historyMeta: { fontSize: 13, color: "#64748B" },
});
