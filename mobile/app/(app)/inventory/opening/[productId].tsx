import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { setOpeningStock } from "@/api/inventory";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { inventoryDetailHref } from "@/navigation/hrefs";
import { openingStockFormSchema } from "@/validation/inventory";

export default function OpeningStockScreen() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [quantity, setQuantity] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting || !accessToken || !currentBusiness || !productId) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    const parsed = openingStockFormSchema.safeParse({
      quantity,
      lowStockThreshold: lowStockThreshold || undefined,
      notes,
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

    setIsSubmitting(true);

    try {
      await setOpeningStock(accessToken, currentBusiness.id, productId, {
        quantity: parsed.data.quantity,
        ...(parsed.data.lowStockThreshold
          ? { lowStockThreshold: parsed.data.lowStockThreshold }
          : {}),
        ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      });
      router.replace(inventoryDetailHref(productId));
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
      title="Set Opening Stock"
      subtitle="Initialize stock for this product. This can only be done once."
      isLoading={isSubmitting}
      footer={
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      }
    >
      <FormMessage message={formError} type="error" />

      <FormField
        label="Quantity"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        placeholder="100"
        error={fieldErrors.quantity}
      />

      <FormField
        label="Low-stock Threshold"
        value={lowStockThreshold}
        onChangeText={setLowStockThreshold}
        keyboardType="decimal-pad"
        placeholder="10"
        error={fieldErrors.lowStockThreshold}
      />

      <FormField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        multiline
        error={fieldErrors.notes}
      />

      <FormButton
        label="Save Opening Stock"
        onPress={() => void handleSubmit()}
        disabled={isSubmitting}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  backText: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
});
