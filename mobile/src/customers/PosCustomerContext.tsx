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
import type { PosCustomerSelection } from "./types";

interface PosCustomerContextValue {
  selectedCustomer: PosCustomerSelection | null;
  setSelectedCustomer: (customer: PosCustomerSelection | null) => void;
  clearSelectedCustomer: () => void;
}

const PosCustomerContext = createContext<PosCustomerContextValue | undefined>(
  undefined,
);

export function PosCustomerProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { currentBusiness } = useBusiness();
  const [selectedCustomer, setSelectedCustomerState] =
    useState<PosCustomerSelection | null>(null);
  const businessId = currentBusiness?.id;

  const clearSelectedCustomer = useCallback(() => {
    setSelectedCustomerState(null);
  }, []);

  useEffect(() => {
    clearSelectedCustomer();
  }, [businessId, clearSelectedCustomer]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearSelectedCustomer();
    }
  }, [isAuthenticated, clearSelectedCustomer]);

  const setSelectedCustomer = useCallback(
    (customer: PosCustomerSelection | null) => {
      setSelectedCustomerState(customer);
    },
    [],
  );

  const value = useMemo<PosCustomerContextValue>(
    () => ({
      selectedCustomer,
      setSelectedCustomer,
      clearSelectedCustomer,
    }),
    [selectedCustomer, setSelectedCustomer, clearSelectedCustomer],
  );

  return (
    <PosCustomerContext.Provider value={value}>
      {children}
    </PosCustomerContext.Provider>
  );
}

export function usePosCustomer(): PosCustomerContextValue {
  const context = useContext(PosCustomerContext);

  if (!context) {
    throw new Error("usePosCustomer must be used within a PosCustomerProvider");
  }

  return context;
}
