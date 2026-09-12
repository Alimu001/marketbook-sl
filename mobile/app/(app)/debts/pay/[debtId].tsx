import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { getDebt, recordDebtPayment } from "@/api/debts";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import type { CustomerDebtSummary } from "@/customers";
import { debtDetailHref } from "@/navigation/hrefs";
import { formatMoneyDisplay } from "@/products/money";
import {
  PAYMENT_METHODS,
  isValidMoneyInput,
  type PaymentMethod,
} from "@/sales";
import { z } from "zod";

const paymentFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "Amount is required")
    .regex(/^\d+(\.\d{1,4})?$/, "Enter a valid amount"),
  notes: z.string().trim().max(500).optional(),
});

export default function RecordDebtPaymentScreen() {
  const router = useRouter();
  const { debtId } = useLocalSearchParams<{ debtId: string }>();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [debt, setDebt] = useState<CustomerDebtSummary | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const businessId = currentBusiness?.id;

  const loadDebt = useCallback(async () => {
    if (!accessToken || !businessId || !debtId) {
      return;
    }

    setIsLoading(true);
    setFormError(undefined);

    try {
      const detail = await getDebt(accessToken, businessId, debtId);
      setDebt(detail);
      setAmount(detail.outstandingAmount);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/(auth)/login");
        return;
      }

      setFormError(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, businessId, debtId, logout, router]);

  useEffect(() => {
    void loadDebt();
  }, [loadDebt]);

  const handleSubmit = async () => {
    if (isSubmitting || !accessToken || !businessId || !debtId || !debt) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    const parsed = paymentFormSchema.safeParse({
      amount,
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

    if (!isValidMoneyInput(amount)) {
      setFormError("Enter a valid payment amount.");
      return;
    }

    setIsSubmitting(true);

    try {
      await recordDebtPayment(accessToken, businessId, debtId, {
        amount: parsed.data.amount,
        paymentMethod,
        notes: parsed.data.notes,
      });

      router.replace({
        pathname: debtDetailHref(debtId),
        params: { paid: "1" },
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

  if (isLoading) {
    return (
      <AuthScreen title="Record Payment" subtitle="Loading debt details..." isLoading>
        <ActivityIndicator color="#0F766E" />
      </AuthScreen>
    );
  }

  if (!debt) {
    return (
      <AuthScreen title="Record Payment" subtitle="Debt not found.">
        <FormMessage message={formError ?? "Debt not found."} type="error" />
        <FormButton label="Back" onPress={() => router.back()} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Record Payment"
      subtitle={`Outstanding: ${formatMoneyDisplay(debt.outstandingAmount)}`}
      isLoading={isSubmitting}
      footer={
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backText}>Cancel</Text>
        </Pressable>
      }
    >
      <FormMessage message={formError} type="error" />

      <FormField
        label="Payment Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder={debt.outstandingAmount}
        error={fieldErrors.amount}
      />

      <Text style={styles.sectionLabel}>Payment Method</Text>
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
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        multiline
        error={fieldErrors.notes}
      />

      <FormButton
        label="Record Payment"
        onPress={() => void handleSubmit()}
        disabled={isSubmitting}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  backText: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
  },
  paymentMethods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  paymentButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
  },
  paymentButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFEFF",
  },
  paymentButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  paymentButtonTextActive: {
    color: "#0F766E",
  },
});
