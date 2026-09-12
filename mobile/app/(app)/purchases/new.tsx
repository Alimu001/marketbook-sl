import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createPurchase } from "@/api/purchases";
import { listProducts } from "@/api/products";
import {
  ApiError,
  getUserFacingErrorMessage,
} from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import {
  addQuantities,
  formatQuantityDisplay,
  subtractQuantities,
} from "@/inventory/quantity";
import { formatMoneyDisplay, formatProductPrice } from "@/products/money";
import type { Product } from "@/products/types";
import { useDebouncedValue } from "@/products/useDebouncedValue";
import { supplierSelectHref } from "@/navigation/hrefs";
import {
  PAYMENT_METHODS,
  compareMoney,
  isValidMoneyInput,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  type PaymentMethod,
} from "@/sales";
import { usePurchaseCart } from "@/suppliers";

const PAGE_SIZE = 20;

interface PosProduct {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  costPrice: string;
}

export default function NewPurchaseScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const {
    items: cartItems,
    selectedSupplier,
    clearSelectedSupplier,
    addItem,
    updateQuantity,
    updateUnitCost,
    removeItem,
    clearCart,
  } = usePurchaseCart();

  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | undefined>();
  const [discountAmount, setDiscountAmount] = useState("0");
  const [amountPaid, setAmountPaid] = useState("");
  const [amountPaidTouched, setAmountPaidTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [checkoutError, setCheckoutError] = useState<string | undefined>();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const businessId = currentBusiness?.id;

  const loadProducts = async () => {
    if (!accessToken || !businessId) {
      return;
    }

    setIsLoadingProducts(true);
    setProductError(undefined);

    try {
      const productResponse = await listProducts(accessToken, businessId, {
        page: 1,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        isActive: true,
      });

      const merged = productResponse.items.map((product: Product) => ({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        costPrice: product.costPrice,
      }));

      setProducts(merged);
    } catch (error) {
      setProductError(getUserFacingErrorMessage(error));
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, [accessToken, businessId, debouncedSearch]);

  const subtotal = useMemo(() => {
    const lineTotals = cartItems.map((item) =>
      multiplyMoney(item.unitCost, item.quantity),
    );

    if (lineTotals.some((value) => value === null)) {
      return null;
    }

    return sumMoney(lineTotals.filter((value): value is string => value !== null));
  }, [cartItems]);

  const total = useMemo(() => {
    if (!subtotal || !isValidMoneyInput(discountAmount)) {
      return null;
    }

    return subtractMoney(subtotal, discountAmount);
  }, [subtotal, discountAmount]);

  const effectiveAmountPaid = useMemo(() => {
    if (amountPaid.trim() === "" && total) {
      return total;
    }

    if (!isValidMoneyInput(amountPaid)) {
      return null;
    }

    return amountPaid;
  }, [amountPaid, total]);

  const balanceDue = useMemo(() => {
    if (!total || !effectiveAmountPaid) {
      return null;
    }

    return subtractMoney(total, effectiveAmountPaid);
  }, [total, effectiveAmountPaid]);

  const requiresPaymentMethod =
    effectiveAmountPaid !== null && compareMoney(effectiveAmountPaid, "0") === 1;

  useEffect(() => {
    if (total && !amountPaidTouched) {
      setAmountPaid(total);
    }
  }, [total, amountPaidTouched]);

  const handleAddProduct = (product: PosProduct) => {
    addItem({
      productId: product.productId,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      unitCost: product.costPrice,
      quantity: "1",
    });
  };

  const handleIncrease = (productId: string) => {
    const item = cartItems.find((entry) => entry.productId === productId);
    if (!item) {
      return;
    }

    const nextQuantity = addQuantities(item.quantity, "1");
    if (!nextQuantity) {
      return;
    }

    updateQuantity(productId, nextQuantity);
  };

  const handleDecrease = (productId: string) => {
    const item = cartItems.find((entry) => entry.productId === productId);
    if (!item) {
      return;
    }

    const nextQuantity = subtractQuantities(item.quantity, "1");
    if (!nextQuantity || nextQuantity === "0") {
      removeItem(productId);
      return;
    }

    updateQuantity(productId, nextQuantity);
  };

  const handleCheckout = async () => {
    if (!accessToken || !businessId || isCheckingOut) {
      return;
    }

    if (!selectedSupplier) {
      setCheckoutError("Select a supplier before recording the purchase.");
      return;
    }

    if (cartItems.length === 0) {
      setCheckoutError("Add at least one item to the cart.");
      return;
    }

    for (const item of cartItems) {
      if (!isValidMoneyInput(item.unitCost)) {
        setCheckoutError(`Enter a valid unit cost for ${item.name}.`);
        return;
      }
    }

    if (!isValidMoneyInput(discountAmount)) {
      setCheckoutError("Enter a valid discount amount.");
      return;
    }

    if (subtotal && compareMoney(discountAmount, subtotal) === 1) {
      setCheckoutError("Discount cannot exceed subtotal.");
      return;
    }

    if (!effectiveAmountPaid) {
      setCheckoutError("Enter a valid amount paid.");
      return;
    }

    if (total && compareMoney(effectiveAmountPaid, total) === 1) {
      setCheckoutError("Amount paid cannot exceed total.");
      return;
    }

    if (requiresPaymentMethod && !paymentMethod) {
      setCheckoutError("Select a payment method for the amount being paid now.");
      return;
    }

    setCheckoutError(undefined);
    setIsCheckingOut(true);

    try {
      const result = await createPurchase(accessToken, businessId, {
        supplierId: selectedSupplier.id,
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
        })),
        discountAmount,
        amountPaid: effectiveAmountPaid,
        ...(requiresPaymentMethod ? { paymentMethod } : {}),
      });

      clearCart();
      clearSelectedSupplier();
      router.replace({
        pathname: "/(app)/purchases/[purchaseId]",
        params: {
          purchaseId: result.purchase.id,
          completed: "1",
        },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }

      setCheckoutError(getUserFacingErrorMessage(error));
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>New Purchase</Text>

        <Text style={styles.sectionTitle}>Supplier</Text>
        <View style={styles.supplierSection}>
          {selectedSupplier ? (
            <View style={styles.selectedSupplier}>
              <Text style={styles.selectedSupplierName}>
                {selectedSupplier.name}
              </Text>
              {selectedSupplier.phone ? (
                <Text style={styles.selectedSupplierMeta}>
                  {selectedSupplier.phone}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.emptyText}>No supplier selected</Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(supplierSelectHref)}
            style={({ pressed }) => [
              styles.selectSupplierButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.selectSupplierText}>
              {selectedSupplier ? "Change Supplier" : "Select Supplier"}
            </Text>
          </Pressable>
          {selectedSupplier ? (
            <Pressable
              accessibilityRole="button"
              onPress={clearSelectedSupplier}
              style={styles.clearSupplierLink}
            >
              <Text style={styles.clearSupplierText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search products..."
          style={styles.searchInput}
        />

        {productError ? <FormMessage type="error" message={productError} /> : null}
        {checkoutError ? <FormMessage type="error" message={checkoutError} /> : null}

        <Text style={styles.sectionTitle}>Product results</Text>
        {isLoadingProducts ? (
          <ActivityIndicator color="#0F766E" style={styles.loader} />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.productId}
            scrollEnabled={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No active products found.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.productRow}>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productMeta}>
                    Cost: {formatProductPrice(item.costPrice, item.unit)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleAddProduct(item)}
                  style={({ pressed }) => [
                    styles.addButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </Pressable>
              </View>
            )}
          />
        )}

        <Text style={styles.sectionTitle}>Cart</Text>
        {cartItems.length === 0 ? (
          <Text style={styles.emptyText}>Cart is empty.</Text>
        ) : (
          cartItems.map((item) => (
            <View key={item.productId} style={styles.cartRow}>
              <View style={styles.cartInfo}>
                <Text style={styles.productName}>{item.name}</Text>
                <View style={styles.unitCostRow}>
                  <Text style={styles.unitCostLabel}>Unit cost</Text>
                  <TextInput
                    value={item.unitCost}
                    onChangeText={(value) => updateUnitCost(item.productId, value)}
                    keyboardType="decimal-pad"
                    style={styles.unitCostInput}
                  />
                </View>
                <Text style={styles.productMeta}>
                  × {formatQuantityDisplay(item.quantity)} {item.unit}
                </Text>
                <Text style={styles.lineTotal}>
                  {formatMoneyDisplay(
                    multiplyMoney(item.unitCost, item.quantity) ?? "0.00",
                  )}
                </Text>
              </View>
              <View style={styles.quantityControls}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleDecrease(item.productId)}
                  style={styles.quantityButton}
                >
                  <Text style={styles.quantityButtonText}>-</Text>
                </Pressable>
                <Text style={styles.quantityValue}>
                  {formatQuantityDisplay(item.quantity)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleIncrease(item.productId)}
                  style={styles.quantityButton}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>
            {formatMoneyDisplay(subtotal ?? "0.00")}
          </Text>
        </View>

        <View style={styles.discountSection}>
          <Text style={styles.summaryLabel}>Discount</Text>
          <TextInput
            value={discountAmount}
            onChangeText={setDiscountAmount}
            keyboardType="decimal-pad"
            style={styles.discountInput}
          />
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {formatMoneyDisplay(total ?? "0.00")}
          </Text>
        </View>

        <View style={styles.discountSection}>
          <Text style={styles.summaryLabel}>Amount Paid Now</Text>
          <TextInput
            value={amountPaid}
            onChangeText={(value) => {
              setAmountPaidTouched(true);
              setAmountPaid(value);
            }}
            keyboardType="decimal-pad"
            style={styles.discountInput}
            placeholder={total ?? "0.00"}
          />
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Balance Due</Text>
          <Text style={styles.summaryValue}>
            {formatMoneyDisplay(balanceDue ?? "0.00")}
          </Text>
        </View>

        {requiresPaymentMethod ? (
          <>
            <Text style={styles.sectionTitle}>Payment Method</Text>
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
          </>
        ) : null}

        <FormButton
          label={isCheckingOut ? "Processing..." : "Record Purchase"}
          disabled={isCheckingOut || cartItems.length === 0 || !selectedSupplier}
          onPress={() => void handleCheckout()}
        />
      </ScrollView>
    </SafeAreaView>
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
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 16,
  },
  searchInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 8,
  },
  loader: {
    marginVertical: 12,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 15,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 10,
  },
  productInfo: {
    flex: 1,
    paddingRight: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  productMeta: {
    fontSize: 14,
    color: "#475569",
    marginTop: 4,
  },
  addButton: {
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  cartRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  cartInfo: {
    gap: 4,
  },
  unitCostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  unitCostLabel: {
    fontSize: 14,
    color: "#475569",
    fontWeight: "600",
  },
  unitCostInput: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  },
  lineTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F766E",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  quantityButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  quantityValue: {
    minWidth: 40,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 16,
    color: "#475569",
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  discountSection: {
    gap: 8,
  },
  discountInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F766E",
  },
  paymentMethods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
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
  buttonPressed: {
    opacity: 0.9,
  },
  supplierSection: {
    gap: 10,
  },
  selectedSupplier: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 4,
  },
  selectedSupplierName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  selectedSupplierMeta: {
    fontSize: 14,
    color: "#64748B",
  },
  selectSupplierButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#0F766E",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  selectSupplierText: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
  },
  clearSupplierLink: {
    alignSelf: "flex-start",
  },
  clearSupplierText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },
});
