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
  clearBusinessesCache,
  getBusinessesCache,
  getSelectedBusinessId,
  saveSelectedBusinessId,
  saveBusinessesCache,
} from "@/business/businessStorage";

interface BusinessContextValue {
  businesses: BusinessSummary[];
  currentBusiness: BusinessSummary | null;
  isLoading: boolean;
  isInitialized: boolean;
  loadError: string | null;
  loadBusinesses: () => Promise<void>;
  createBusiness: (input: { name: string; phone: string; address: string }) => Promise<BusinessSummary>;
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
  const { accessToken, user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [currentBusiness, setCurrentBusiness] =
    useState<BusinessSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);
  const activeUserIdRef = useRef<string | undefined>(undefined);

  const clearBusinessState = useCallback(async () => {
    setBusinesses([]);
    setCurrentBusiness(null);
    setIsInitialized(false);
    setLoadError(null);
    if (user?.id) {
      await clearSelectedBusinessId(user.id);
      await clearBusinessesCache(user.id);
    }
  }, [user?.id]);

  const selectBusiness = useCallback(async (business: BusinessSummary) => {
    setCurrentBusiness(business);
    if (!user?.id) return;
    await saveSelectedBusinessId(user.id, business.id);
  }, [user?.id]);

  const applyLoadedBusinesses = useCallback(
    async (loadedBusinesses: BusinessSummary[]) => {
      setBusinesses(loadedBusinesses);

      if (!user?.id) return;
      const savedBusinessId = await getSelectedBusinessId(user.id);

      if (savedBusinessId) {
        const savedBusiness = loadedBusinesses.find(
          (business) => business.id === savedBusinessId,
        );

        if (savedBusiness) {
          setCurrentBusiness(savedBusiness);
          return;
        }

        await clearSelectedBusinessId(user.id);
        setCurrentBusiness(null);
      }

      if (
        loadedBusinesses.length > 0 &&
        (loadedBusinesses.length === 1 ||
          !loadedBusinesses.some((business) => business.role === "owner"))
      ) {
        await selectBusiness(loadedBusinesses[0]!);
        return;
      }

      setCurrentBusiness(null);
    },
    [selectBusiness, user?.id],
  );

  const loadBusinesses = useCallback(async () => {
    if (!accessToken || !user?.id) {
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

      await saveBusinessesCache(user.id, loadedBusinesses);
      await applyLoadedBusinesses(loadedBusinesses);
    } catch (error) {
      if (requestId !== loadRequestId.current) {
        return;
      }

      if (error instanceof ApiError && error.status === 401) {
        await clearBusinessState();
        throw error;
      }

      if (error instanceof ApiError && error.status === 0) {
        const cachedBusinesses = await getBusinessesCache(user.id);
        if (cachedBusinesses.length > 0) {
          await applyLoadedBusinesses(cachedBusinesses);
          setLoadError(null);
        } else {
          setLoadError("Connect to the internet once to prepare offline access.");
        }
      } else {
        setLoadError(getUserFacingErrorMessage(error));
        setBusinesses([]);
        setCurrentBusiness(null);
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setIsLoading(false);
        setIsInitialized(true);
      }
    }
  }, [accessToken, user?.id, applyLoadedBusinesses, clearBusinessState]);

  const createBusiness = useCallback(
    async (input: { name: string; phone: string; address: string }) => {
      if (!accessToken || !user?.id) {
        throw new ApiError(401, "UNAUTHORIZED", "Your session has expired.");
      }

      const response = await createBusinessRequest(accessToken, input);
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

      const cachedBusinesses = await getBusinessesCache(user.id);
      await saveBusinessesCache(user.id, [
        ...cachedBusinesses.filter((business) => business.id !== summary.id),
        summary,
      ]);

      await selectBusiness(summary);
      return summary;
    },
    [accessToken, user?.id, selectBusiness],
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated || !accessToken) {
      activeUserIdRef.current = undefined;
      void clearBusinessState();
      return;
    }

    if (activeUserIdRef.current !== user?.id) {
      activeUserIdRef.current = user?.id;
      setBusinesses([]);
      setCurrentBusiness(null);
      setLoadError(null);
      setIsInitialized(false);
    }

    void loadBusinesses().catch(() => {
      // Route screens surface load failures when business data is required.
    });
  }, [
    authLoading,
    isAuthenticated,
    accessToken,
    user?.id,
    loadBusinesses,
    clearBusinessState,
  ]);

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
