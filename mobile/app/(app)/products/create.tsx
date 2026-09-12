import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createProduct } from "@/api/products";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { productsHref } from "@/navigation/hrefs";
import { canCreateProduct } from "@/products";
import {
  createProductFormSchema,
  UNIT_SUGGESTIONS,
} from "@/validation/product";

export default function CreateProductScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const role = currentBusiness?.role;
  const canCreate = role ? canCreateProduct(role) : false;

  if (!canCreate) {
    return (
      <AuthScreen title="Add Product" subtitle="You do not have permission to create products.">
        <FormMessage
          message="Your role can view products but cannot create them."
          type="error"
        />
        <FormButton label="Back to Products" onPress={() => router.replace(productsHref)} />
      </AuthScreen>
    );
  }

  const handleSubmit = async () => {
    if (isSubmitting || !accessToken || !currentBusiness) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    const parsed = createProductFormSchema.safeParse({
      name,
      description,
      sku,
      barcode,
      unit,
      costPrice,
      sellingPrice,
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
      await createProduct(accessToken, currentBusiness.id, parsed.data);
      router.replace({
        pathname: productsHref,
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
      title="Add Product"
      subtitle="Create a product for your business catalog."
      isLoading={isSubmitting}
      footer={
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      }
    >
      <FormMessage message={formError} type="error" />

      <FormField
        label="Product Name"
        value={name}
        onChangeText={setName}
        placeholder="Cement"
        error={fieldErrors.name}
      />

      <FormField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="Product description"
        multiline
        error={fieldErrors.description}
      />

      <FormField
        label="SKU (optional)"
        value={sku}
        onChangeText={setSku}
        autoCapitalize="characters"
        placeholder="CEM-001"
        error={fieldErrors.sku}
      />

      <FormField
        label="Barcode (optional)"
        value={barcode}
        onChangeText={setBarcode}
        keyboardType="number-pad"
        placeholder="1234567890123"
        error={fieldErrors.barcode}
      />

      <FormField
        label="Unit"
        value={unit}
        onChangeText={setUnit}
        autoCapitalize="none"
        placeholder="bag"
        error={fieldErrors.unit}
      />

      <View style={styles.unitSuggestions}>
        {UNIT_SUGGESTIONS.map((suggestion) => (
          <Pressable
            key={suggestion}
            accessibilityRole="button"
            onPress={() => setUnit(suggestion)}
            style={({ pressed }) => [
              styles.unitChip,
              unit === suggestion && styles.unitChipActive,
              pressed && styles.unitChipPressed,
            ]}
          >
            <Text
              style={[
                styles.unitChipText,
                unit === suggestion && styles.unitChipTextActive,
              ]}
            >
              {suggestion}
            </Text>
          </Pressable>
        ))}
      </View>

      <FormField
        label="Cost Price"
        value={costPrice}
        onChangeText={setCostPrice}
        keyboardType="decimal-pad"
        placeholder="100.00"
        error={fieldErrors.costPrice}
      />

      <FormField
        label="Selling Price"
        value={sellingPrice}
        onChangeText={setSellingPrice}
        keyboardType="decimal-pad"
        placeholder="120.00"
        error={fieldErrors.sellingPrice}
      />

      <FormButton
        label="Create Product"
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
  unitSuggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: -8,
  },
  unitChip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  unitChipActive: {
    backgroundColor: "#CCFBF1",
    borderColor: "#0F766E",
  },
  unitChipPressed: {
    opacity: 0.9,
  },
  unitChipText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  unitChipTextActive: {
    color: "#0F766E",
  },
});
