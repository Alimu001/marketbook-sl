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
  archiveSupplier,
  getSupplier,
  getSupplierHistory,
  restoreSupplier,
  updateSupplier,
} from "@/api/suppliers";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import {
  canArchiveSupplier,
  canEditSupplier,
  canRestoreSupplier,
  formatPayableStatus,
  formatPurchasePaymentStatus,
  formatSupplierDateTime,
  type SupplierDetail,
  type SupplierHistory,
} from "@/suppliers";
import {
  payableDetailHref,
  purchaseDetailHref,
  suppliersHref,
} from "@/navigation/hrefs";
import { formatDateDisplay, formatMoneyDisplay } from "@/products/money";
import { z } from "zod";

const updateSupplierFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(150),
    phone: z.string().trim().max(32).optional(),
    email: z.string().trim().max(254).optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export default function SupplierDetailScreen() {
  const router = useRouter();
  const { supplierId } = useLocalSearchParams<{ supplierId: string }>();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [history, setHistory] = useState<SupplierHistory | null>(null);
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
  const canEdit = role ? canEditSupplier(role) : false;
  const canArchive = role ? canArchiveSupplier(role) : false;
  const canRestore = role ? canRestoreSupplier(role) : false;

  const populateForm = useCallback((entry: SupplierDetail) => {
    setName(entry.name);
    setPhone(entry.phone ?? "");
    setEmail(entry.email ?? "");
    setAddress(entry.address ?? "");
    setNotes(entry.notes ?? "");
  }, []);

  const loadSupplier = useCallback(async () => {
    if (!accessToken || !currentBusiness || !supplierId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const [entry, historyData] = await Promise.all([
        getSupplier(accessToken, currentBusiness.id, supplierId),
        getSupplierHistory(accessToken, currentBusiness.id, supplierId),
      ]);
      setSupplier(entry);
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
    supplierId,
    logout,
    populateForm,
    router,
  ]);

  useEffect(() => {
    void loadSupplier();
  }, [loadSupplier]);

  const handleSave = async () => {
    if (isSaving || !accessToken || !currentBusiness || !supplierId || !supplier) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    const parsed = updateSupplierFormSchema.safeParse({
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
      const updated = await updateSupplier(
        accessToken,
        currentBusiness.id,
        supplierId,
        parsed.data,
      );
      setSupplier(updated);
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
    if (!supplier || !accessToken || !currentBusiness || !supplierId) {
      return;
    }

    Alert.alert(
      `Archive ${supplier.name}?`,
      "Archived suppliers cannot be used for new purchases.",
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
                const updated = await archiveSupplier(
                  accessToken,
                  currentBusiness.id,
                  supplierId,
                );
                setSupplier(updated);
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
    if (isArchiving || !accessToken || !currentBusiness || !supplierId) {
      return;
    }

    setIsArchiving(true);
    setFormError(undefined);

    try {
      const updated = await restoreSupplier(
        accessToken,
        currentBusiness.id,
        supplierId,
      );
      setSupplier(updated);
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

  if (!supplier) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <FormMessage
            message={errorMessage ?? "Supplier not found."}
            type="error"
          />
          <FormButton
            label="Back to Suppliers"
            onPress={() => router.replace(suppliersHref)}
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
          {isEditing ? "Edit Supplier" : supplier.name}
        </Text>
        <Text style={styles.status}>
          {supplier.isActive ? "Active" : "Archived"}
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
                populateForm(supplier);
                setIsEditing(false);
                setFieldErrors({});
                setFormError(undefined);
              }}
              disabled={isSaving}
            />
          </View>
        ) : (
          <View style={styles.details}>
            <DetailRow label="Phone" value={supplier.phone ?? "—"} />
            <DetailRow label="Email" value={supplier.email ?? "—"} />
            <DetailRow label="Address" value={supplier.address ?? "—"} />
            <DetailRow label="Notes" value={supplier.notes ?? "—"} />
            <DetailRow
              label="Outstanding Payable"
              value={formatMoneyDisplay(supplier.outstandingBalance)}
            />
            <DetailRow
              label="Open Payables"
              value={String(supplier.openPayableCount)}
            />
            <DetailRow
              label="Created"
              value={formatDateDisplay(supplier.createdAt)}
            />

            {canEdit ? (
              <FormButton
                label="Edit"
                onPress={() => setIsEditing(true)}
                disabled={isArchiving}
              />
            ) : null}

            {canArchive && supplier.isActive ? (
              <FormButton
                label="Archive"
                variant="secondary"
                onPress={handleArchive}
                disabled={isArchiving}
              />
            ) : null}

            {canRestore && !supplier.isActive ? (
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
            <Text style={styles.sectionTitle}>Recent Purchases</Text>
            {history.purchases.length === 0 ? (
              <Text style={styles.emptyHistory}>No purchases yet.</Text>
            ) : (
              history.purchases.slice(0, 5).map((purchase) => (
                <Pressable
                  key={purchase.id}
                  accessibilityRole="button"
                  onPress={() => router.push(purchaseDetailHref(purchase.id))}
                  style={styles.historyRow}
                >
                  <Text style={styles.historyPrimary}>
                    {purchase.purchaseNumber}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {formatMoneyDisplay(purchase.totalAmount)} ·{" "}
                    {formatPurchasePaymentStatus(purchase.paymentStatus)}
                  </Text>
                  <Text style={styles.historyDate}>
                    {formatSupplierDateTime(purchase.createdAt)}
                  </Text>
                </Pressable>
              ))
            )}

            <Text style={styles.sectionTitle}>Payables</Text>
            {history.payables.length === 0 ? (
              <Text style={styles.emptyHistory}>No payables recorded.</Text>
            ) : (
              history.payables.slice(0, 5).map((payable) => (
                <Pressable
                  key={payable.id}
                  accessibilityRole="button"
                  onPress={() => router.push(payableDetailHref(payable.id))}
                  style={styles.historyRow}
                >
                  <Text style={styles.historyPrimary}>
                    {payable.purchaseNumber}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {formatMoneyDisplay(payable.outstandingAmount)} due ·{" "}
                    {formatPayableStatus(payable.status)}
                  </Text>
                  <Text style={styles.historyDate}>
                    {formatSupplierDateTime(payable.createdAt)}
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
