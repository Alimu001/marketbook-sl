import { ApiError } from "@/api/errors";
import { getDashboardSummary as apiGetDashboardSummary } from "@/api/reports";
import type { BusinessRole } from "@/api/businesses";
import type { ReportPeriodRange, RoleSensitiveDashboardSummary } from "@/reports";
import {
  listCacheRecords,
  upsertCacheRecord,
} from "../cache/base";
import { isOnlineStatus } from "../network";
import type { NetworkStatus, SyncScope } from "../types";

function dashboardCacheKey(
  range: ReportPeriodRange,
  role: BusinessRole,
): string {
  return `${role}:${range.from}:${range.to}`;
}

function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "NETWORK_ERROR";
}

async function getCachedDashboard(
  scope: SyncScope,
  range: ReportPeriodRange,
  role: BusinessRole,
): Promise<RoleSensitiveDashboardSummary | null> {
  const records = await listCacheRecords<RoleSensitiveDashboardSummary>(
    scope.userId,
    scope.businessId,
    "dashboard",
  );

  const cacheKey = dashboardCacheKey(range, role);

  const record = records.find(
    (entry) => entry.serverId === cacheKey,
  );

  return record?.data ?? null;
}

export async function getDashboardSummary(
  scope: SyncScope,
  networkStatus: NetworkStatus,
  range: ReportPeriodRange,
  role: BusinessRole,
): Promise<{
  data: RoleSensitiveDashboardSummary;
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
        serverId: dashboardCacheKey(range, role),
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

  const cached = await getCachedDashboard(scope, range, role);

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
