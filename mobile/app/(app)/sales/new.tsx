import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { createSale } from "@/api/sales";
import { listInventory } from "@/api/inventory";
import { listProducts } from "@/api/products";
import {
  ApiError,
  getInsufficientStockMessage,
  getUserFacingErrorMessage,
} from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { usePosCustomer } from "@/customers";
import {
  addQuantities,
  formatQuantityDisplay,
  formatQuantityWithUnit,
  subtractQuantities,
} from "@/inventory/quantity";
import { formatMoneyDisplay, formatProductPrice } from "@/products/money";
import type { Product } from "@/products/types";
import { useDebouncedValue } from "@/products/useDebouncedValue";
import { customerSelectHref, saleDetailHref } from "@/navigation/hrefs";
import {
  PAYMENT_METHODS,
  compareMoney,
  isValidMoneyInput,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  useSaleCart,
  type PaymentMethod,
} from "@/sales";

const PAGE_SIZE = 20;

interface PosProduct {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  sellingPrice: string;
  quantity: string;
}

function quantityExceedsStock(quantity: string, stock: string): boolean {
  return subtractQuantities(stock, quantity) === null;
}

export default function NewSaleScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const {
    items: cartItems,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    setAvailableStock,
  } = useSaleCart();
  const { selectedCustomer, clearSelectedCustomer } = usePosCustomer();

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

  const loadProducts = useCallback(async () => {
    if (!accessToken || !businessId) {
      return;
    }

    setIsLoadingProducts(true);
    setProductError(undefined);

    try {
      const [inventoryResponse, productResponse] = await Promise.all([
        listInventory(accessToken, businessId, {
          page: 1,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
          isActive: true,
        }),
        listProducts(accessToken, businessId, {
          page: 1,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
          isActive: true,
        }),
      ]);

      const stockByProductId = new Map(
        inventoryResponse.items.map((item) => [item.productId, item.quantity]),
      );

      const merged = productResponse.items
        .map((product: Product) => ({
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          sellingPrice: product.sellingPrice,
          quantity: stockByProductId.get(product.id) ?? "0",
        }))
        .filter((product) => product.quantity !== undefined);

      setProducts(merged);
    } catch (error) {
      setProductError(getUserFacingErrorMessage(error));
    } finally {
      setIsLoadingProducts(false);
    }
  }, [accessToken, businessId, debouncedSearch]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const subtotal = useMemo(() => {
    const lineTotals = cartItems.map((item) =>
      multiplyMoney(item.unitPrice, item.quantity),
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

  const isCreditSale = balanceDue !== null && compareMoney(balanceDue, "0") === 1;
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
      unitPrice: product.sellingPrice,
      availableStock: product.quantity,
      quantity: "1",
    });
  };

  const handleIncrease = (productId: string) => {
    const item = cartItems.find((entry) => entry.productId === productId);
    if (!item) {
      return;
    }

    const nextQuantity = addQuantities(item.quantity, "1");
    if (!nextQuantity || quantityExceedsStock(nextQuantity, item.availableStock)) {
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

    if (cartItems.length === 0) {
      setCheckoutError("Add at least one item to the cart.");
      return;
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

    if (isCreditSale && !selectedCustomer) {
      setCheckoutError("Select a customer for credit sales with a balance due.");
      return;
    }

    if (requiresPaymentMethod && !paymentMethod) {
      setCheckoutError("Select a payment method for the amount being paid now.");
      return;
    }

    for (const item of cartItems) {
      if (quantityExceedsStock(item.quantity, item.availableStock)) {
        setCheckoutError(
          `Stock changed. ${item.name} now has only ${formatQuantityDisplay(item.availableStock)} ${item.unit} available.`,
        );
        void loadProducts();
        return;
      }
    }

    setCheckoutError(undefined);
    setIsCheckingOut(true);

    try {
      const result = await createSale(accessToken, businessId, {
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        discountAmount,
        customerId: selectedCustomer?.id,
        amountPaid: effectiveAmountPaid,
        ...(requiresPaymentMethod ? { paymentMethod } : {}),
      });

      clearCart();
      clearSelectedCustomer();
      router.replace({
        pathname: "/(app)/sales/[saleId]",
        params: {
          saleId: result.sale.id,
          completed: "1",
        },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }

      if (error instanceof ApiError && error.code === "INSUFFICIENT_STOCK") {
        const stockMessage = getInsufficientStockMessage(error);
        setCheckoutError(stockMessage ?? getUserFacingErrorMessage(error));

        const details = error.details;
        if (
          typeof details === "object" &&
          details !== null &&
          "productId" in details &&
          "available" in details
        ) {
          setAvailableStock(String(details.productId), String(details.available));
        }

        void loadProducts();
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
        <Text style={styles.title}>New Sale</Text>

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
                    {formatProductPrice(item.sellingPrice, item.unit)}
                  </Text>
                  <Text style={styles.productMeta}>
                    Stock: {formatQuantityWithUnit(item.quantity, item.unit)}
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
                <Text style={styles.productMeta}>
                  {formatMoneyDisplay(item.unitPrice)} × {formatQuantityDisplay(item.quantity)}
                </Text>
                <Text style={styles.lineTotal}>
                  {formatMoneyDisplay(
                    multiplyMoney(item.unitPrice, item.quantity) ?? "0.00",
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

        <Text style={styles.sectionTitle}>Customer</Text>
        <View style={styles.customerSection}>
          {selectedCustomer ? (
            <View style={styles.selectedCustomer}>
              <Text style={styles.selectedCustomerName}>
                {selectedCustomer.name}
              </Text>
              {selectedCustomer.phone ? (
                <Text style={styles.selectedCustomerMeta}>
                  {selectedCustomer.phone}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.emptyText}>Walk-in customer (no account)</Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(customerSelectHref)}
            style={({ pressed }) => [
              styles.selectCustomerButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.selectCustomerText}>
              {selectedCustomer ? "Change Customer" : "Select Customer"}
            </Text>
          </Pressable>
          {selectedCustomer ? (
            <Pressable
              accessibilityRole="button"
              onPress={clearSelectedCustomer}
              style={styles.clearCustomerLink}
            >
              <Text style={styles.clearCustomerText}>Clear</Text>
            </Pressable>
          ) : null}
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
          <Text
            style={[
              styles.summaryValue,
              isCreditSale && styles.balanceDueValue,
            ]}
          >
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
          label={isCheckingOut ? "Processing..." : "Complete Sale"}
          disabled={isCheckingOut || cartItems.length === 0}
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
  customerSection: {
    gap: 10,
  },
  selectedCustomer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 4,
  },
  selectedCustomerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  selectedCustomerMeta: {
    fontSize: 14,
    color: "#64748B",
  },
  selectCustomerButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#0F766E",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  selectCustomerText: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
  },
  clearCustomerLink: {
    alignSelf: "flex-start",
  },
  clearCustomerText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },
  balanceDueValue: {
    color: "#DC2626",
  },
});
