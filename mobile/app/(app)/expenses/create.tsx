import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { createExpense, listExpenseCategories } from "@/api/expenses";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import {
  canCreateExpense,
  type ExpenseCategorySummary,
} from "@/expenses";
import { expensesHref } from "@/navigation/hrefs";
import { isValidMoneyInput } from "@/products/money";
import { PAYMENT_METHODS, type PaymentMethod } from "@/sales";
import { z } from "zod";

const createExpenseFormSchema = z
  .object({
    categoryId: z.string().uuid("Select a category"),
    amount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,4})?$/, "Amount must be a valid decimal")
      .refine((value) => Number(value) > 0, "Amount must be greater than zero"),
    paymentMethod: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER"]),
    expenseDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expense date must be YYYY-MM-DD"),
    vendorOrPayee: z.string().trim().max(150).optional(),
    referenceNumber: z.string().trim().max(64).optional(),
    description: z.string().trim().min(1, "Description is required").max(500),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

function todayAsInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function CreateExpenseScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [categories, setCategories] = useState<ExpenseCategorySummary[]>([]);
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [expenseDate, setExpenseDate] = useState(todayAsInput());
  const [vendorOrPayee, setVendorOrPayee] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const role = currentBusiness?.role;
  const canCreate = role ? canCreateExpense(role) : false;

  useEffect(() => {
    if (!accessToken || !currentBusiness) {
      return;
    }

    setIsLoadingCategories(true);

    void listExpenseCategories(accessToken, currentBusiness.id, {
      isActive: true,
    })
      .then((response) => {
        setCategories(response);
        if (response.length > 0) {
          setCategoryId(response[0].id);
        }
      })
      .catch((error) => {
        setFormError(getUserFacingErrorMessage(error));
      })
      .finally(() => {
        setIsLoadingCategories(false);
      });
  }, [accessToken, currentBusiness]);

  if (!canCreate) {
    return (
      <AuthScreen
        title="Add Expense"
        subtitle="You do not have permission to record expenses."
      >
        <FormMessage
          message="Your role cannot record expenses."
          type="error"
        />
        <FormButton
          label="Back to Expenses"
          onPress={() => router.replace(expensesHref)}
        />
      </AuthScreen>
    );
  }

  const handleSubmit = async () => {
    if (isSubmitting || !accessToken || !currentBusiness || !categoryId) {
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

    const parsed = createExpenseFormSchema.safeParse(payload);

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

    setIsSubmitting(true);

    try {
      await createExpense(accessToken, currentBusiness.id, parsed.data);
      router.replace({
        pathname: expensesHref,
        params: { created: "1" },
      } as never);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/(auth)/login");
        return;
      }

      setFormError(getUserFacingErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="Add Expense"
      subtitle="Record an ordinary business expense. This does not affect inventory."
      isLoading={isSubmitting || isLoadingCategories}
      footer={
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      }
    >
      <FormMessage message={formError} type="error" />

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
      {fieldErrors.categoryId ? (
        <FormMessage message={fieldErrors.categoryId} type="error" />
      ) : null}

      <FormField
        label="Amount (NLe)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        error={fieldErrors.amount}
        placeholder="250"
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
                paymentMethod === method.value && styles.paymentButtonTextActive,
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
        label="Vendor / Payee (optional)"
        value={vendorOrPayee}
        onChangeText={setVendorOrPayee}
        error={fieldErrors.vendorOrPayee}
      />

      <FormField
        label="Reference Number (optional)"
        value={referenceNumber}
        onChangeText={setReferenceNumber}
        autoCapitalize="characters"
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
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        error={fieldErrors.notes}
        multiline
      />

      <FormButton
        label="Save Expense"
        onPress={() => void handleSubmit()}
        disabled={isSubmitting || isLoadingCategories || !categoryId}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  backText: {
    color: "#0F766E",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  categoryRow: {
    marginBottom: 12,
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
    marginBottom: 16,
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
