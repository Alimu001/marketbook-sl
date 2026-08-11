import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { addQuantities, isValidQuantityInput } from "@/inventory/quantity";
import type { PosSupplierSelection, PurchaseCartItem } from "./types";

interface PurchaseCartContextValue {
  selectedSupplier: PosSupplierSelection | null;
  setSelectedSupplier: (supplier: PosSupplierSelection | null) => void;
  clearSelectedSupplier: () => void;
  items: PurchaseCartItem[];
  addItem: (
    item: Omit<PurchaseCartItem, "quantity"> & { quantity?: string },
  ) => void;
  updateQuantity: (productId: string, quantity: string) => void;
  updateUnitCost: (productId: string, unitCost: string) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

const PurchaseCartContext = createContext<PurchaseCartContextValue | undefined>(
  undefined,
);

export function PurchaseCartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { currentBusiness } = useBusiness();
  const [selectedSupplier, setSelectedSupplierState] =
    useState<PosSupplierSelection | null>(null);
  const [items, setItems] = useState<PurchaseCartItem[]>([]);
  const businessId = currentBusiness?.id;

  const clearSelectedSupplier = useCallback(() => {
    setSelectedSupplierState(null);
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    clearSelectedSupplier();
  }, [clearSelectedSupplier]);

  useEffect(() => {
    clearCart();
  }, [businessId, clearCart]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearCart();
    }
  }, [isAuthenticated, clearCart]);

  const setSelectedSupplier = useCallback(
    (supplier: PosSupplierSelection | null) => {
      setSelectedSupplierState(supplier);
    },
    [],
  );

  const addItem = useCallback(
    (item: Omit<PurchaseCartItem, "quantity"> & { quantity?: string }) => {
      const quantity = item.quantity ?? "1";

      if (!isValidQuantityInput(quantity)) {
        return;
      }

      setItems((current) => {
        const existing = current.find(
          (entry) => entry.productId === item.productId,
        );

        if (!existing) {
          return [
            ...current,
            {
              ...item,
              quantity,
            },
          ];
        }

        const mergedQuantity = addQuantities(existing.quantity, quantity);

        if (!mergedQuantity) {
          return current;
        }

        return current.map((entry) =>
          entry.productId === item.productId
            ? { ...entry, quantity: mergedQuantity, unitCost: item.unitCost }
            : entry,
        );
      });
    },
    [],
  );

  const updateQuantity = useCallback((productId: string, quantity: string) => {
    if (!isValidQuantityInput(quantity)) {
      return;
    }

    setItems((current) =>
      current.map((entry) =>
        entry.productId === productId ? { ...entry, quantity } : entry,
      ),
    );
  }, []);

  const updateUnitCost = useCallback((productId: string, unitCost: string) => {
    setItems((current) =>
      current.map((entry) =>
        entry.productId === productId ? { ...entry, unitCost } : entry,
      ),
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((current) =>
      current.filter((entry) => entry.productId !== productId),
    );
  }, []);

  const value = useMemo<PurchaseCartContextValue>(
    () => ({
      selectedSupplier,
      setSelectedSupplier,
      clearSelectedSupplier,
      items,
      addItem,
      updateQuantity,
      updateUnitCost,
      removeItem,
      clearCart,
    }),
    [
      selectedSupplier,
      setSelectedSupplier,
      clearSelectedSupplier,
      items,
      addItem,
      updateQuantity,
      updateUnitCost,
      removeItem,
      clearCart,
    ],
  );

  return (
    <PurchaseCartContext.Provider value={value}>
      {children}
    </PurchaseCartContext.Provider>
  );
}

export function usePurchaseCart(): PurchaseCartContextValue {
  const context = useContext(PurchaseCartContext);

  if (!context) {
    throw new Error("usePurchaseCart must be used within a PurchaseCartProvider");
  }

  return context;
}
