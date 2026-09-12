import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { getInventory, updateLowStockThreshold } from "@/api/inventory";
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
import { thresholdFormSchema } from "@/validation/inventory";

export default function ThresholdScreen() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !currentBusiness || !productId) {
      return;
    }

    void (async () => {
      try {
        const inventory = await getInventory(
          accessToken,
          currentBusiness.id,
          productId,
        );
        setLowStockThreshold(inventory.lowStockThreshold);
      } catch (error) {
        setFormError(getUserFacingErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [accessToken, currentBusiness, productId]);

  const handleSubmit = async () => {
    if (isSubmitting || !accessToken || !currentBusiness || !productId) {
      return;
    }

    setFieldError(undefined);
    setFormError(undefined);

    const parsed = thresholdFormSchema.safeParse({ lowStockThreshold });

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid threshold");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateLowStockThreshold(
        accessToken,
        currentBusiness.id,
        productId,
        parsed.data,
      );
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
      title="Low-stock Threshold"
      subtitle="Set the quantity at which this product is considered low stock. Use 0 to disable alerts."
      isLoading={isSubmitting || isLoading}
      footer={
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      }
    >
      <FormMessage message={formError} type="error" />

      <FormField
        label="Low-stock Threshold"
        value={lowStockThreshold}
        onChangeText={setLowStockThreshold}
        keyboardType="decimal-pad"
        placeholder="10"
        error={fieldError}
      />

      <FormButton
        label="Save Threshold"
        onPress={() => void handleSubmit()}
        disabled={isSubmitting || isLoading}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  backText: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
});
