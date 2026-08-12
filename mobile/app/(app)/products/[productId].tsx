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
  archiveProduct,
  getProduct,
  restoreProduct,
  updateProduct,
} from "@/api/products";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { productsHref } from "@/navigation/hrefs";
import {
  canArchiveProduct,
  canEditProduct,
  canRestoreProduct,
  formatDateDisplay,
  formatMoneyDisplay,
  type Product,
} from "@/products";
import {
  updateProductFormSchema,
  UNIT_SUGGESTIONS,
} from "@/validation/product";

export default function ProductDetailScreen() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");

  const role = currentBusiness?.role;
  const canEdit = role ? canEditProduct(role) : false;
  const canArchive = role ? canArchiveProduct(role) : false;
  const canRestore = role ? canRestoreProduct(role) : false;

  const populateForm = useCallback((entry: Product) => {
    setName(entry.name);
    setDescription(entry.description ?? "");
    setSku(entry.sku ?? "");
    setBarcode(entry.barcode ?? "");
    setUnit(entry.unit);
    setCostPrice(entry.costPrice);
    setSellingPrice(entry.sellingPrice);
  }, []);

  const loadProduct = useCallback(async () => {
    if (!accessToken || !currentBusiness || !productId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const entry = await getProduct(
        accessToken,
        currentBusiness.id,
        productId,
      );
      setProduct(entry);
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
    logout,
    populateForm,
    productId,
    router,
  ]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const handleSave = async () => {
    if (isSaving || !accessToken || !currentBusiness || !productId || !product) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    const parsed = updateProductFormSchema.safeParse({
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

    setIsSaving(true);

    try {
      const updated = await updateProduct(
        accessToken,
        currentBusiness.id,
        productId,
        parsed.data,
      );
      setProduct(updated);
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
    if (!product || !accessToken || !currentBusiness || !productId) {
      return;
    }

    Alert.alert(
      `Archive ${product.name}?`,
      "Archived products remain in your records but cannot be used as active products.",
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
                const updated = await archiveProduct(
                  accessToken,
                  currentBusiness.id,
                  productId,
                );
                setProduct(updated);
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
    if (isArchiving || !accessToken || !currentBusiness || !productId) {
      return;
    }

    setIsArchiving(true);
    setFormError(undefined);

    try {
      const updated = await restoreProduct(
        accessToken,
        currentBusiness.id,
        productId,
      );
      setProduct(updated);
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

  if (!product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <FormMessage message={errorMessage ?? "Product not found."} type="error" />
          <FormButton label="Back to Products" onPress={() => router.replace(productsHref)} />
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

        <Text style={styles.title}>{isEditing ? "Edit Product" : product.name}</Text>
        <Text style={styles.status}>
          {product.isActive ? "Active" : "Archived"}
        </Text>

        <FormMessage message={formError} type="error" />

        {isEditing ? (
          <View style={styles.form}>
            <FormField
              label="Product Name"
              value={name}
              onChangeText={setName}
              error={fieldErrors.name}
            />
            <FormField
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              error={fieldErrors.description}
            />
            <FormField
              label="SKU (optional)"
              value={sku}
              onChangeText={setSku}
              autoCapitalize="characters"
              error={fieldErrors.sku}
            />
            <FormField
              label="Barcode (optional)"
              value={barcode}
              onChangeText={setBarcode}
              keyboardType="number-pad"
              error={fieldErrors.barcode}
            />
            <FormField
              label="Unit"
              value={unit}
              onChangeText={setUnit}
              autoCapitalize="none"
              error={fieldErrors.unit}
            />
            <View style={styles.unitSuggestions}>
              {UNIT_SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  onPress={() => setUnit(suggestion)}
                  style={[
                    styles.unitChip,
                    unit === suggestion && styles.unitChipActive,
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
              error={fieldErrors.costPrice}
            />
            <FormField
              label="Selling Price"
              value={sellingPrice}
              onChangeText={setSellingPrice}
              keyboardType="decimal-pad"
              error={fieldErrors.sellingPrice}
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
                populateForm(product);
                setIsEditing(false);
                setFieldErrors({});
                setFormError(undefined);
              }}
              disabled={isSaving}
            />
          </View>
        ) : (
          <View style={styles.details}>
            <DetailRow label="Description" value={product.description ?? "—"} />
            <DetailRow label="SKU" value={product.sku ?? "—"} />
            <DetailRow label="Barcode" value={product.barcode ?? "—"} />
            <DetailRow label="Unit" value={product.unit} />
            <DetailRow
              label="Cost Price"
              value={formatMoneyDisplay(product.costPrice)}
            />
            <DetailRow
              label="Selling Price"
              value={formatMoneyDisplay(product.sellingPrice)}
            />
            <DetailRow
              label="Created"
              value={formatDateDisplay(product.createdAt)}
            />

            {canEdit ? (
              <FormButton
                label="Edit"
                onPress={() => setIsEditing(true)}
                disabled={isArchiving}
              />
            ) : null}

            {canArchive && product.isActive ? (
              <FormButton
                label="Archive"
                variant="secondary"
                onPress={handleArchive}
                disabled={isArchiving}
              />
            ) : null}

            {canRestore && !product.isActive ? (
              <FormButton
                label="Restore"
                onPress={() => void handleRestore()}
                disabled={isArchiving}
              />
            ) : null}
          </View>
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
  unitChipText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  unitChipTextActive: {
    color: "#0F766E",
  },
});
