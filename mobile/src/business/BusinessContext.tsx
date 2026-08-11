import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createBusiness as createBusinessRequest,
  listBusinesses,
  type BusinessSummary,
  type CreateBusinessResponse,
} from "@/api/businesses";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import {
  clearSelectedBusinessId,
  getSelectedBusinessId,
  saveSelectedBusinessId,
} from "@/business/businessStorage";

interface BusinessContextValue {
  businesses: BusinessSummary[];
  currentBusiness: BusinessSummary | null;
  isLoading: boolean;
  isInitialized: boolean;
  loadError: string | null;
  loadBusinesses: () => Promise<void>;
  createBusiness: (name: string) => Promise<BusinessSummary>;
  selectBusiness: (business: BusinessSummary) => Promise<void>;
  clearBusinessState: () => Promise<void>;
}

const BusinessContext = createContext<BusinessContextValue | undefined>(
  undefined,
);

function toBusinessSummary(
  response: CreateBusinessResponse,
): BusinessSummary {
  return {
    id: response.business.id,
    name: response.business.name,
    role: response.membership.role,
    createdAt: response.business.createdAt,
  };
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [currentBusiness, setCurrentBusiness] =
    useState<BusinessSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  const clearBusinessState = useCallback(async () => {
    setBusinesses([]);
    setCurrentBusiness(null);
    setIsInitialized(false);
    setLoadError(null);
    await clearSelectedBusinessId();
  }, []);

  const selectBusiness = useCallback(async (business: BusinessSummary) => {
    setCurrentBusiness(business);
    await saveSelectedBusinessId(business.id);
  }, []);

  const applyLoadedBusinesses = useCallback(
    async (loadedBusinesses: BusinessSummary[]) => {
      setBusinesses(loadedBusinesses);

      const savedBusinessId = await getSelectedBusinessId();

      if (savedBusinessId) {
        const savedBusiness = loadedBusinesses.find(
          (business) => business.id === savedBusinessId,
        );

        if (savedBusiness) {
          setCurrentBusiness(savedBusiness);
          return;
        }

        await clearSelectedBusinessId();
        setCurrentBusiness(null);
      }

      if (loadedBusinesses.length === 1) {
        await selectBusiness(loadedBusinesses[0]!);
        return;
      }

      setCurrentBusiness(null);
    },
    [selectBusiness],
  );

  const loadBusinesses = useCallback(async () => {
    if (!accessToken) {
      await clearBusinessState();
      return;
    }

    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const loadedBusinesses = await listBusinesses(accessToken);

      if (requestId !== loadRequestId.current) {
        return;
      }

      await applyLoadedBusinesses(loadedBusinesses);
    } catch (error) {
      if (requestId !== loadRequestId.current) {
        return;
      }

      if (error instanceof ApiError && error.status === 401) {
        await clearBusinessState();
        throw error;
      }

      setLoadError(getUserFacingErrorMessage(error));
      setBusinesses([]);
      setCurrentBusiness(null);
    } finally {
      if (requestId === loadRequestId.current) {
        setIsLoading(false);
        setIsInitialized(true);
      }
    }
  }, [accessToken, applyLoadedBusinesses, clearBusinessState]);

  const createBusiness = useCallback(
    async (name: string) => {
      if (!accessToken) {
        throw new ApiError(401, "UNAUTHORIZED", "Your session has expired.");
      }

      const response = await createBusinessRequest(accessToken, { name });
      const summary = toBusinessSummary(response);

      setBusinesses((previous) => {
        const existingIndex = previous.findIndex(
          (business) => business.id === summary.id,
        );

        if (existingIndex === -1) {
          return [...previous, summary];
        }

        const next = [...previous];
        next[existingIndex] = summary;
        return next;
      });

      await selectBusiness(summary);
      return summary;
    },
    [accessToken, selectBusiness],
  );

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      void clearBusinessState();
      return;
    }

    void loadBusinesses().catch(() => {
      // Route screens surface load failures when business data is required.
    });
  }, [isAuthenticated, accessToken, loadBusinesses, clearBusinessState]);

  const value = useMemo<BusinessContextValue>(
    () => ({
      businesses,
      currentBusiness,
      isLoading,
      isInitialized,
      loadError,
      loadBusinesses,
      createBusiness,
      selectBusiness,
      clearBusinessState,
    }),
    [
      businesses,
      currentBusiness,
      isLoading,
      isInitialized,
      loadError,
      loadBusinesses,
      createBusiness,
      selectBusiness,
      clearBusinessState,
    ],
  );

  return (
    <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
  );
}

export function useBusiness(): BusinessContextValue {
  const context = useContext(BusinessContext);

  if (!context) {
    throw new Error("useBusiness must be used within a BusinessProvider");
  }

  return context;
}

export function formatBusinessRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
