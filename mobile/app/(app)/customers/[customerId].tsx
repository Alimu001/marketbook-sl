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
  archiveCustomer,
  getCustomer,
  getCustomerHistory,
  restoreCustomer,
  updateCustomer,
} from "@/api/customers";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import {
  canArchiveCustomer,
  canEditCustomer,
  canRestoreCustomer,
  formatCustomerDateTime,
  formatDebtStatus,
  formatSalePaymentStatus,
  type CustomerDetail,
  type CustomerHistory,
} from "@/customers";
import { customersHref, debtDetailHref, saleDetailHref } from "@/navigation/hrefs";
import { formatDateDisplay, formatMoneyDisplay } from "@/products/money";
import { z } from "zod";

const updateCustomerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(150),
    phone: z.string().trim().max(32).optional(),
    email: z.string().trim().max(254).optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export default function CustomerDetailScreen() {
  const router = useRouter();
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const role = currentBusiness?.role;
  const canEdit = role ? canEditCustomer(role) : false;
  const canArchive = role ? canArchiveCustomer(role) : false;
  const canRestore = role ? canRestoreCustomer(role) : false;

  const populateForm = useCallback((entry: CustomerDetail) => {
    setName(entry.name);
    setPhone(entry.phone ?? "");
    setEmail(entry.email ?? "");
    setAddress(entry.address ?? "");
    setNotes(entry.notes ?? "");
  }, []);

  const loadCustomer = useCallback(async () => {
    if (!accessToken || !currentBusiness || !customerId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const [entry, historyData] = await Promise.all([
        getCustomer(accessToken, currentBusiness.id, customerId),
        getCustomerHistory(accessToken, currentBusiness.id, customerId),
      ]);
      setCustomer(entry);
      setHistory(historyData);
      populateForm(entry);
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
  }, [
    accessToken,
    currentBusiness,
    customerId,
    logout,
    populateForm,
    router,
  ]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  const handleSave = async () => {
    if (isSaving || !accessToken || !currentBusiness || !customerId || !customer) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    const parsed = updateCustomerFormSchema.safeParse({
      name,
      phone: phone || undefined,
      email: email || undefined,
      address: address || undefined,
      notes: notes || undefined,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? "form";
        if (!errors[key]) {
          errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);

    try {
      const updated = await updateCustomer(
        accessToken,
        currentBusiness.id,
        customerId,
        parsed.data,
      );
      setCustomer(updated);
      populateForm(updated);
      setIsEditing(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/(auth)/login");
        return;
      }

      setFormError(getUserFacingErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = () => {
    if (!customer || !accessToken || !currentBusiness || !customerId) {
      return;
    }

    Alert.alert(
      `Archive ${customer.name}?`,
      "Archived customers cannot be used for new credit sales.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setIsArchiving(true);
              setFormError(undefined);

              try {
                const updated = await archiveCustomer(
                  accessToken,
                  currentBusiness.id,
                  customerId,
                );
                setCustomer(updated);
                populateForm(updated);
                setIsEditing(false);
              } catch (error) {
                setFormError(getUserFacingErrorMessage(error));
              } finally {
                setIsArchiving(false);
              }
            })();
          },
        },
      ],
    );
  };

  const handleRestore = async () => {
    if (isArchiving || !accessToken || !currentBusiness || !customerId) {
      return;
    }

    setIsArchiving(true);
    setFormError(undefined);

    try {
      const updated = await restoreCustomer(
        accessToken,
        currentBusiness.id,
        customerId,
      );
      setCustomer(updated);
      populateForm(updated);
      setIsEditing(false);
    } catch (error) {
      setFormError(getUserFacingErrorMessage(error));
    } finally {
      setIsArchiving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!customer) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <FormMessage
            message={errorMessage ?? "Customer not found."}
            type="error"
          />
          <FormButton
            label="Back to Customers"
            onPress={() => router.replace(customersHref)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>

        <Text style={styles.title}>
          {isEditing ? "Edit Customer" : customer.name}
        </Text>
        <Text style={styles.status}>
          {customer.isActive ? "Active" : "Archived"}
        </Text>

        <FormMessage message={formError} type="error" />

        {isEditing ? (
          <View style={styles.form}>
            <FormField
              label="Name"
              value={name}
              onChangeText={setName}
              error={fieldErrors.name}
            />
            <FormField
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              error={fieldErrors.phone}
            />
            <FormField
              label="Email (optional)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              error={fieldErrors.email}
            />
            <FormField
              label="Address (optional)"
              value={address}
              onChangeText={setAddress}
              multiline
              error={fieldErrors.address}
            />
            <FormField
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              multiline
              error={fieldErrors.notes}
            />
            <FormButton
              label="Save Changes"
              onPress={() => void handleSave()}
              disabled={isSaving}
            />
            <FormButton
              label="Cancel"
              variant="secondary"
              onPress={() => {
                populateForm(customer);
                setIsEditing(false);
                setFieldErrors({});
                setFormError(undefined);
              }}
              disabled={isSaving}
            />
          </View>
        ) : (
          <View style={styles.details}>
            <DetailRow label="Phone" value={customer.phone ?? "—"} />
            <DetailRow label="Email" value={customer.email ?? "—"} />
            <DetailRow label="Address" value={customer.address ?? "—"} />
            <DetailRow label="Notes" value={customer.notes ?? "—"} />
            <DetailRow
              label="Outstanding Balance"
              value={formatMoneyDisplay(customer.outstandingBalance)}
            />
            <DetailRow
              label="Open Debts"
              value={String(customer.openDebtCount)}
            />
            <DetailRow
              label="Created"
              value={formatDateDisplay(customer.createdAt)}
            />

            {canEdit ? (
              <FormButton
                label="Edit"
                onPress={() => setIsEditing(true)}
                disabled={isArchiving}
              />
            ) : null}

            {canArchive && customer.isActive ? (
              <FormButton
                label="Archive"
                variant="secondary"
                onPress={handleArchive}
                disabled={isArchiving}
              />
            ) : null}

            {canRestore && !customer.isActive ? (
              <FormButton
                label="Restore"
                onPress={() => void handleRestore()}
                disabled={isArchiving}
              />
            ) : null}
          </View>
        )}

        {history ? (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Recent Sales</Text>
            {history.sales.length === 0 ? (
              <Text style={styles.emptyHistory}>No sales yet.</Text>
            ) : (
              history.sales.slice(0, 5).map((sale) => (
                <Pressable
                  key={sale.id}
                  accessibilityRole="button"
                  onPress={() => router.push(saleDetailHref(sale.id))}
                  style={styles.historyRow}
                >
                  <Text style={styles.historyPrimary}>{sale.receiptNumber}</Text>
                  <Text style={styles.historyMeta}>
                    {formatMoneyDisplay(sale.totalAmount)} ·{" "}
                    {formatSalePaymentStatus(sale.paymentStatus)}
                  </Text>
                  <Text style={styles.historyDate}>
                    {formatCustomerDateTime(sale.createdAt)}
                  </Text>
                </Pressable>
              ))
            )}

            <Text style={styles.sectionTitle}>Debts</Text>
            {history.debts.length === 0 ? (
              <Text style={styles.emptyHistory}>No debts recorded.</Text>
            ) : (
              history.debts.slice(0, 5).map((debt) => (
                <Pressable
                  key={debt.id}
                  accessibilityRole="button"
                  onPress={() => router.push(debtDetailHref(debt.id))}
                  style={styles.historyRow}
                >
                  <Text style={styles.historyPrimary}>{debt.receiptNumber}</Text>
                  <Text style={styles.historyMeta}>
                    {formatMoneyDisplay(debt.outstandingAmount)} due ·{" "}
                    {formatDebtStatus(debt.status)}
                  </Text>
                  <Text style={styles.historyDate}>
                    {formatCustomerDateTime(debt.createdAt)}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}
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
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 16,
  },
  backLink: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
  },
  status: {
    fontSize: 15,
    fontWeight: "600",
    color: "#475569",
  },
  details: {
    gap: 12,
    marginTop: 8,
  },
  detailRow: {
    gap: 4,
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: 16,
    color: "#0F172A",
    lineHeight: 22,
  },
  form: {
    gap: 16,
    marginTop: 8,
  },
  historySection: {
    marginTop: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 8,
  },
  emptyHistory: {
    fontSize: 15,
    color: "#64748B",
  },
  historyRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 4,
  },
  historyPrimary: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  historyMeta: {
    fontSize: 14,
    color: "#475569",
    fontWeight: "600",
  },
  historyDate: {
    fontSize: 13,
    color: "#64748B",
  },
});
