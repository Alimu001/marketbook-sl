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
import { AppState, type AppStateStatus } from "react-native";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { clearCacheForOtherUsers, getSyncMetadata } from "./cache/base";
import { refreshReadCaches } from "./cacheRefresh";
import { initializeOfflineDatabase } from "./db";
import {
  getCurrentNetworkStatus,
  isOnlineStatus,
  subscribeToNetworkStatus,
} from "./network";
import { retainQueueForUser } from "./syncQueue";
import { runSyncEngine } from "./syncEngine";
import type { NetworkStatus, SyncBannerState, SyncScope } from "./types";

interface OfflineContextValue {
  networkStatus: NetworkStatus;
  isOnline: boolean;
  isOfflineData: boolean;
  bannerState: SyncBannerState;
  bannerMessage: string | null;
  lastSyncedAt: string | null;
  isInitialized: boolean;
  isSyncing: boolean;
  pendingCount: number;
  syncNow: () => Promise<void>;
  getScope: () => SyncScope | null;
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

function formatRelativeTime(iso: string | null): string | null {
  if (!iso) {
    return null;
  }

  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>("UNKNOWN");
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [bannerState, setBannerState] = useState<SyncBannerState>("hidden");
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const previousUserId = useRef<string | null>(null);
  const syncInFlight = useRef(false);
  const syncNowRef = useRef<() => Promise<void>>(async () => {});

  const scope = useMemo<SyncScope | null>(() => {
    if (!user?.id || !accessToken || !currentBusiness?.id) {
      return null;
    }

    return {
      userId: user.id,
      businessId: currentBusiness.id,
      accessToken,
    };
  }, [user?.id, accessToken, currentBusiness?.id]);

  useEffect(() => {
    void initializeOfflineDatabase()
      .then(() => setIsInitialized(true))
      .catch(() => setIsInitialized(true));
  }, []);

  useEffect(() => {
    void getCurrentNetworkStatus().then(setNetworkStatus);
    return subscribeToNetworkStatus(setNetworkStatus);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      previousUserId.current = null;
      return;
    }

    if (previousUserId.current && previousUserId.current !== user.id) {
      void clearCacheForOtherUsers(user.id);
      void retainQueueForUser(user.id);
    }

    previousUserId.current = user.id;
  }, [user?.id]);

  const refreshPendingCount = useCallback(async () => {
    if (!scope) {
      setPendingCount(0);
      return;
    }

    const { countSyncQueueByStatus } = await import("./syncQueue");
    const counts = await countSyncQueueByStatus(
      scope.userId,
      scope.businessId,
    );
    setPendingCount(counts.PENDING + counts.FAILED + counts.CONFLICT);
  }, [scope]);

  const loadLastSyncedAt = useCallback(async () => {
    if (!scope) {
      setLastSyncedAt(null);
      return;
    }

    const refreshed = await getSyncMetadata(
      scope.userId,
      scope.businessId,
      "last_refreshed_at",
    );
    const synced = await getSyncMetadata(
      scope.userId,
      scope.businessId,
      "last_sync_at",
    );
    setLastSyncedAt(synced ?? refreshed);
  }, [scope]);

  const syncNow = useCallback(async () => {
    if (!scope || !isOnlineStatus(networkStatus) || syncInFlight.current) {
      return;
    }

    syncInFlight.current = true;
    setIsSyncing(true);
    setBannerState("syncing");
    setBannerMessage("Back online — syncing changes");

    try {
      await refreshReadCaches(scope);
      const result = await runSyncEngine(scope);
      await refreshPendingCount();
      await loadLastSyncedAt();

      if (result.authRequired) {
        setBannerState("sync_errors");
        setBannerMessage("Sign in again to continue syncing.");
        return;
      }

      if (result.conflictCount > 0 || result.failedCount > 0) {
        setBannerState("sync_errors");
        setBannerMessage("Some changes need attention");
        return;
      }

      if (result.syncedCount > 0) {
        setBannerState("synced");
        setBannerMessage("All changes synced");
        setTimeout(() => setBannerState("hidden"), 3000);
        return;
      }

      setBannerState("hidden");
    } finally {
      setIsSyncing(false);
      syncInFlight.current = false;
    }
  }, [scope, networkStatus, refreshPendingCount, loadLastSyncedAt]);

  syncNowRef.current = syncNow;

  useEffect(() => {
    if (!scope || !isInitialized) {
      return;
    }

    void refreshPendingCount();
    void loadLastSyncedAt();

    if (isOnlineStatus(networkStatus)) {
      void syncNowRef.current();
    }
  }, [scope, isInitialized, networkStatus, refreshPendingCount, loadLastSyncedAt]);

  useEffect(() => {
    if (!isOnlineStatus(networkStatus)) {
      setBannerState("offline");
      setBannerMessage("Offline — showing saved data");
      return;
    }

    if (!isSyncing && bannerState === "offline") {
      setBannerState("hidden");
    }
  }, [networkStatus, isSyncing, bannerState]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active" && isOnlineStatus(networkStatus)) {
          void syncNowRef.current();
        }
      },
    );

    return () => subscription.remove();
  }, [networkStatus]);

  const value = useMemo<OfflineContextValue>(
    () => ({
      networkStatus,
      isOnline: isOnlineStatus(networkStatus),
      isOfflineData: !isOnlineStatus(networkStatus),
      bannerState,
      bannerMessage,
      lastSyncedAt,
      isInitialized,
      isSyncing,
      pendingCount,
      syncNow,
      getScope: () => scope,
    }),
    [
      networkStatus,
      bannerState,
      bannerMessage,
      lastSyncedAt,
      isInitialized,
      isSyncing,
      pendingCount,
      syncNow,
      scope,
    ],
  );

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}

export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);

  if (!context) {
    throw new Error("useOffline must be used within an OfflineProvider");
  }

  return context;
}

export function useOfflineRelativeTime(): string | null {
  const { lastSyncedAt, isOfflineData } = useOffline();

  if (isOfflineData) {
    return formatRelativeTime(lastSyncedAt)
      ? `Last updated ${formatRelativeTime(lastSyncedAt)}`
      : "Offline data";
  }

  return null;
}
