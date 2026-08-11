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
  archiveExpense,
  getExpense,
  listExpenseCategories,
  restoreExpense,
  updateExpense,
} from "@/api/expenses";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import {
  canArchiveExpense,
  canEditExpense,
  canRestoreExpense,
  formatExpenseDateDisplay,
  formatExpenseDateTime,
  type ExpenseCategorySummary,
  type ExpenseDetail,
} from "@/expenses";
import { expensesHref } from "@/navigation/hrefs";
import { formatMoneyDisplay, isValidMoneyInput } from "@/products/money";
import { PAYMENT_METHODS, formatPaymentMethod, type PaymentMethod } from "@/sales";
import { z } from "zod";

const updateExpenseFormSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,4})?$/, "Amount must be a valid decimal")
      .refine((value) => Number(value) > 0, "Amount must be greater than zero")
      .optional(),
    paymentMethod: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER"]).optional(),
    expenseDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expense date must be YYYY-MM-DD")
      .optional(),
    vendorOrPayee: z.string().trim().max(150).optional(),
    referenceNumber: z.string().trim().max(64).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export default function ExpenseDetailScreen() {
  const router = useRouter();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [expense, setExpense] = useState<ExpenseDetail | null>(null);
  const [categories, setCategories] = useState<ExpenseCategorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [expenseDate, setExpenseDate] = useState("");
  const [vendorOrPayee, setVendorOrPayee] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const role = currentBusiness?.role;
  const canEdit = role ? canEditExpense(role) : false;
  const canArchive = role ? canArchiveExpense(role) : false;
  const canRestore = role ? canRestoreExpense(role) : false;

  const populateForm = useCallback((entry: ExpenseDetail) => {
    setCategoryId(entry.category.id);
    setAmount(entry.amount);
    setPaymentMethod(entry.paymentMethod);
    setExpenseDate(entry.expenseDate);
    setVendorOrPayee(entry.vendorOrPayee ?? "");
    setReferenceNumber(entry.referenceNumber ?? "");
    setDescription(entry.description);
    setNotes(entry.notes ?? "");
  }, []);

  const loadExpense = useCallback(async () => {
    if (!accessToken || !currentBusiness || !expenseId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const [entry, categoryList] = await Promise.all([
        getExpense(accessToken, currentBusiness.id, expenseId),
        listExpenseCategories(accessToken, currentBusiness.id, {
          isActive: true,
        }),
      ]);

      setExpense(entry);
      setCategories(categoryList);
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
  }, [accessToken, currentBusiness, expenseId, logout, populateForm, router]);

  useEffect(() => {
    void loadExpense();
  }, [loadExpense]);

  const handleSave = async () => {
    if (isSaving || !accessToken || !currentBusiness || !expenseId || !expense) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    if (!isValidMoneyInput(amount)) {
      setFieldErrors({ amount: "Enter a valid amount greater than zero" });
      return;
    }

    const payload = {
      categoryId,
      amount: amount.trim(),
      paymentMethod,
      expenseDate: expenseDate.trim(),
      vendorOrPayee: vendorOrPayee.trim() || undefined,
      referenceNumber: referenceNumber.trim() || undefined,
      description: description.trim(),
      notes: notes.trim() || undefined,
    };

    const parsed = updateExpenseFormSchema.safeParse(payload);

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
      const updated = await updateExpense(
        accessToken,
        currentBusiness.id,
        expenseId,
        parsed.data,
      );
      setExpense(updated);
      populateForm(updated);
      setIsEditing(false);
    } catch (error) {
      setFormError(getUserFacingErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveToggle = () => {
    if (!accessToken || !currentBusiness || !expenseId || !expense) {
      return;
    }

    const restoring = expense.isArchived;

    Alert.alert(
      restoring ? "Restore Expense" : "Archive Expense",
      restoring
        ? "Restore this expense to active records?"
        : "Archive this expense? It will remain available in history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: restoring ? "Restore" : "Archive",
          style: restoring ? "default" : "destructive",
          onPress: () => {
            void (async () => {
              setIsArchiving(true);
              try {
                const updated = restoring
                  ? await restoreExpense(
                      accessToken,
                      currentBusiness.id,
                      expenseId,
                    )
                  : await archiveExpense(
                      accessToken,
                      currentBusiness.id,
                      expenseId,
                    );
                setExpense(updated);
                populateForm(updated);
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0F766E" />
        </View>
      </SafeAreaView>
    );
  }

  if (!expense) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <FormMessage message={errorMessage ?? "Expense not found."} type="error" />
          <FormButton
            label="Back to Expenses"
            onPress={() => router.replace(expensesHref)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>

        <Text style={styles.title}>Expense Details</Text>
        <Text style={styles.subtitle}>{currentBusiness?.name}</Text>

        <FormMessage message={errorMessage} type="error" />
        <FormMessage message={formError} type="error" />

        {isEditing ? (
          <>
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  onPress={() => setCategoryId(category.id)}
                  style={[
                    styles.categoryChip,
                    categoryId === category.id && styles.categoryChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      categoryId === category.id && styles.categoryChipTextActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <FormField
              label="Amount (NLe)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              error={fieldErrors.amount}
            />

            <Text style={styles.label}>Payment Method</Text>
            <View style={styles.paymentMethods}>
              {PAYMENT_METHODS.map((method) => (
                <Pressable
                  key={method.value}
                  accessibilityRole="button"
                  onPress={() => setPaymentMethod(method.value)}
                  style={[
                    styles.paymentButton,
                    paymentMethod === method.value && styles.paymentButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.paymentButtonText,
                      paymentMethod === method.value &&
                        styles.paymentButtonTextActive,
                    ]}
                  >
                    {method.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <FormField
              label="Expense Date (YYYY-MM-DD)"
              value={expenseDate}
              onChangeText={setExpenseDate}
              autoCapitalize="none"
              error={fieldErrors.expenseDate}
            />
            <FormField
              label="Vendor / Payee"
              value={vendorOrPayee}
              onChangeText={setVendorOrPayee}
              error={fieldErrors.vendorOrPayee}
            />
            <FormField
              label="Reference Number"
              value={referenceNumber}
              onChangeText={setReferenceNumber}
              error={fieldErrors.referenceNumber}
            />
            <FormField
              label="Description"
              value={description}
              onChangeText={setDescription}
              error={fieldErrors.description}
              multiline
            />
            <FormField
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              error={fieldErrors.notes}
              multiline
            />

            <View style={styles.actionRow}>
              <FormButton
                label="Save Changes"
                onPress={() => void handleSave()}
                disabled={isSaving}
              />
              <FormButton
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  populateForm(expense);
                  setIsEditing(false);
                }}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.detailCard}>
              <DetailRow label="Category" value={expense.category.name} />
              <DetailRow
                label="Amount"
                value={formatMoneyDisplay(expense.amount)}
              />
              <DetailRow
                label="Payment Method"
                value={formatPaymentMethod(expense.paymentMethod)}
              />
              <DetailRow
                label="Expense Date"
                value={formatExpenseDateDisplay(expense.expenseDate)}
              />
              <DetailRow
                label="Vendor / Payee"
                value={expense.vendorOrPayee ?? "—"}
              />
              <DetailRow
                label="Reference"
                value={expense.referenceNumber ?? "—"}
              />
              <DetailRow label="Description" value={expense.description} />
              <DetailRow label="Notes" value={expense.notes ?? "—"} />
              <DetailRow
                label="Recorded By"
                value={expense.recordedBy.name ?? expense.recordedBy.email}
              />
              <DetailRow
                label="Created At"
                value={formatExpenseDateTime(expense.createdAt)}
              />
              <DetailRow
                label="Updated At"
                value={formatExpenseDateTime(expense.updatedAt)}
              />
              <DetailRow
                label="Status"
                value={expense.isArchived ? "Archived" : "Active"}
              />
              {!expense.category.isActive ? (
                <Text style={styles.archivedCategoryNote}>
                  Category is archived but preserved on this expense.
                </Text>
              ) : null}
            </View>

            <View style={styles.actionRow}>
              {canEdit ? (
                <FormButton
                  label="Edit"
                  onPress={() => setIsEditing(true)}
                />
              ) : null}
              {canArchive && !expense.isArchived ? (
                <FormButton
                  label="Archive"
                  variant="secondary"
                  onPress={handleArchiveToggle}
                  disabled={isArchiving}
                />
              ) : null}
              {canRestore && expense.isArchived ? (
                <FormButton
                  label="Restore"
                  onPress={handleArchiveToggle}
                  disabled={isArchiving}
                />
              ) : null}
            </View>
          </>
        )}
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
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
  },
  backLink: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
  },
  detailCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 12,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: 16,
    color: "#0F172A",
  },
  archivedCategoryNote: {
    fontSize: 13,
    color: "#B45309",
    fontWeight: "600",
  },
  actionRow: {
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
  },
  categoryRow: {
    maxHeight: 44,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: "#FFFFFF",
  },
  categoryChipActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  categoryChipText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
  },
  categoryChipTextActive: {
    color: "#FFFFFF",
  },
  paymentMethods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  paymentButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  paymentButtonActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  paymentButtonText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
  },
  paymentButtonTextActive: {
    color: "#FFFFFF",
  },
});
