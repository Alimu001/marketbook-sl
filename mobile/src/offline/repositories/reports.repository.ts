import { ApiError } from "@/api/errors";
import { getDashboardSummary as apiGetDashboardSummary } from "@/api/reports";
import type { DashboardSummary, ReportPeriodRange } from "@/reports";
import {
  listCacheRecords,
  upsertCacheRecord,
} from "../cache/base";
import { isOnlineStatus } from "../network";
import type { NetworkStatus, SyncScope } from "../types";

function dashboardCacheKey(range: ReportPeriodRange): string {
  return `${range.from}:${range.to}`;
}

function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "NETWORK_ERROR";
}

async function getCachedDashboard(
  scope: SyncScope,
  range: ReportPeriodRange,
): Promise<DashboardSummary | null> {
  const records = await listCacheRecords<DashboardSummary>(
    scope.userId,
    scope.businessId,
    "dashboard",
  );

  const cacheKey = dashboardCacheKey(range);

  const record = records.find(
    (entry) => entry.serverId === cacheKey,
  );

  return record?.data ?? null;
}

export async function getDashboardSummary(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  range: ReportPeriodRange,
): Promise<{
  data: DashboardSummary;
  fromCache: boolean;
}> {
  if (isOnlineStatus(networkStatus)) {
    try {
      const summary = await apiGetDashboardSummary(
        scope.accessToken,
        scope.businessId,
        range,
      );

      await upsertCacheRecord({
        userId: scope.userId,
        businessId: scope.businessId,
        entityType: "dashboard",
        serverId: dashboardCacheKey(range),
        data: summary,
      });

      return {
        data: summary,
        fromCache: false,
      };
    } catch (error) {
      if (!isNetworkError(error)) {
        throw error;
      }
    }
  }

  const cached = await getCachedDashboard(scope, range);

  if (cached) {
    return {
      data: cached,
      fromCache: true,
    };
  }

  throw new ApiError(
    0,
    "OFFLINE",
    "No saved dashboard data is available for this period.",
  );
}