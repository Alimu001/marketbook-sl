import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { adjustInventory, getInventory } from "@/api/inventory";
import { getProduct } from "@/api/products";
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
import {
  ADJUSTMENT_TYPE_OPTIONS,
  formatQuantityWithUnit,
  isOutboundTransaction,
  subtractQuantities,
  type InventoryTransactionType,
} from "@/inventory";
import { stockAdjustmentFormSchema } from "@/validation/inventory";

export default function AdjustInventoryScreen() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [currentQuantity, setCurrentQuantity] = useState("0");
  const [unit, setUnit] = useState("");
  const [type, setType] = useState<InventoryTransactionType>("STOCK_IN");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !currentBusiness || !productId) {
      return;
    }

    void (async () => {
      try {
        const [product, inventory] = await Promise.all([
          getProduct(accessToken, currentBusiness.id, productId),
          getInventory(accessToken, currentBusiness.id, productId),
        ]);
        setCurrentQuantity(inventory.quantity);
        setUnit(product.unit);
      } catch (error) {
        setFormError(getUserFacingErrorMessage(error));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [accessToken, currentBusiness, productId]);

  const previewQuantity = useMemo(() => {
    if (!quantity.trim()) {
      return null;
    }

    if (isOutboundTransaction(type)) {
      return subtractQuantities(currentQuantity, quantity);
    }

    const base = currentQuantity;
    const delta = quantity;
    if (!base || !delta) {
      return null;
    }

    const baseParts = base.split(".");
    const deltaParts = delta.split(".");
    const scale = Math.max(baseParts[1]?.length ?? 0, deltaParts[1]?.length ?? 0);
    const factor = 10 ** scale;
    const result =
      BigInt(baseParts[0] + (baseParts[1] ?? "").padEnd(scale, "0")) +
      BigInt(deltaParts[0] + (deltaParts[1] ?? "").padEnd(scale, "0"));
    const whole = result / BigInt(factor);
    const fraction = result % BigInt(factor);
    if (fraction === 0n) {
      return whole.toString();
    }
    return `${whole}.${fraction.toString().padStart(scale, "0").replace(/0+$/, "")}`;
  }, [currentQuantity, quantity, type]);

  const handleSubmit = async () => {
    if (isSubmitting || !accessToken || !currentBusiness || !productId) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    const parsed = stockAdjustmentFormSchema.safeParse({
      type,
      quantity,
      reason,
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
      await adjustInventory(
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
      title="Adjust Stock"
      subtitle={
        isLoading
          ? "Loading current stock..."
          : `Available: ${formatQuantityWithUnit(currentQuantity, unit)}`
      }
      isLoading={isSubmitting || isLoading}
      footer={
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      }
    >
      <FormMessage message={formError} type="error" />

      <Text style={styles.label}>Adjustment Type</Text>
      <View style={styles.typeGrid}>
        {ADJUSTMENT_TYPE_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            onPress={() => setType(option.value)}
            style={[
              styles.typeChip,
              type === option.value && styles.typeChipActive,
            ]}
          >
            <Text
              style={[
                styles.typeChipText,
                type === option.value && styles.typeChipTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FormField
        label="Quantity"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        placeholder="5"
        error={fieldErrors.quantity}
      />

      {previewQuantity !== null ? (
        <Text style={styles.preview}>
          Resulting stock: {formatQuantityWithUnit(previewQuantity, unit)}
        </Text>
      ) : null}

      <FormField
        label="Reason"
        value={reason}
        onChangeText={setReason}
        placeholder="Physical count correction"
        error={fieldErrors.reason}
      />

      <FormField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        multiline
        error={fieldErrors.notes}
      />

      <FormButton
        label="Apply Adjustment"
        onPress={() => void handleSubmit()}
        disabled={isSubmitting || isLoading}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  backText: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  label: { fontSize: 14, fontWeight: "600", color: "#334155" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  typeChipActive: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  typeChipText: { color: "#475569", fontSize: 13, fontWeight: "600" },
  typeChipTextActive: { color: "#FFFFFF" },
  preview: { fontSize: 14, color: "#475569", fontWeight: "600" },
});
