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
import type { CartItem } from "./types";

interface SaleCartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: string }) => void;
  updateQuantity: (productId: string, quantity: string) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  setAvailableStock: (productId: string, availableStock: string) => void;
}

const SaleCartContext = createContext<SaleCartContextValue | undefined>(
  undefined,
);

export function SaleCartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { currentBusiness } = useBusiness();
  const [items, setItems] = useState<CartItem[]>([]);
  const businessId = currentBusiness?.id;

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  useEffect(() => {
    clearCart();
  }, [businessId, clearCart]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearCart();
    }
  }, [isAuthenticated, clearCart]);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity"> & { quantity?: string }) => {
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
            ? { ...entry, quantity: mergedQuantity, availableStock: item.availableStock }
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

  const removeItem = useCallback((productId: string) => {
    setItems((current) =>
      current.filter((entry) => entry.productId !== productId),
    );
  }, []);

  const setAvailableStock = useCallback(
    (productId: string, availableStock: string) => {
      setItems((current) =>
        current.map((entry) =>
          entry.productId === productId ? { ...entry, availableStock } : entry,
        ),
      );
    },
    [],
  );

  const value = useMemo<SaleCartContextValue>(
    () => ({
      items,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      setAvailableStock,
    }),
    [items, addItem, updateQuantity, removeItem, clearCart, setAvailableStock],
  );

  return (
    <SaleCartContext.Provider value={value}>{children}</SaleCartContext.Provider>
  );
}

export function useSaleCart(): SaleCartContextValue {
  const context = useContext(SaleCartContext);

  if (!context) {
    throw new Error("useSaleCart must be used within a SaleCartProvider");
  }

  return context;
}
