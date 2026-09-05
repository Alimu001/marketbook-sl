import * as SecureStore from "expo-secure-store";
import type { BusinessSummary } from "@/api/businesses";

const SELECTED_BUSINESS_ID_KEY = "marketbook_selected_business_id";
const BUSINESSES_CACHE_KEY = "marketbook_businesses_cache";

function userKey(baseKey: string, userId: string): string {
  return `${baseKey}_${userId}`;
}

export async function saveSelectedBusinessId(
  userId: string,
  businessId: string,
): Promise<void> {
  await SecureStore.setItemAsync(userKey(SELECTED_BUSINESS_ID_KEY, userId), businessId);
}

export async function getSelectedBusinessId(userId: string): Promise<string | null> {
  return SecureStore.getItemAsync(userKey(SELECTED_BUSINESS_ID_KEY, userId));
}

export async function clearSelectedBusinessId(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(userKey(SELECTED_BUSINESS_ID_KEY, userId));
}

export async function saveBusinessesCache(
  userId: string,
  businesses: BusinessSummary[],
): Promise<void> {
  await SecureStore.setItemAsync(
    userKey(BUSINESSES_CACHE_KEY, userId),
    JSON.stringify(businesses),
  );
}

export async function getBusinessesCache(userId: string): Promise<BusinessSummary[]> {
  const key = userKey(BUSINESSES_CACHE_KEY, userId);
  const value = await SecureStore.getItemAsync(key);
  if (!value) return [];

  try {
    return JSON.parse(value) as BusinessSummary[];
  } catch {
    await SecureStore.deleteItemAsync(key);
    return [];
  }
}

export async function clearBusinessesCache(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(userKey(BUSINESSES_CACHE_KEY, userId));
}
