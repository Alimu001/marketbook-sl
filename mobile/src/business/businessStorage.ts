import * as SecureStore from "expo-secure-store";
import type { BusinessSummary } from "@/api/businesses";

const SELECTED_BUSINESS_ID_KEY = "marketbook_selected_business_id";
const BUSINESSES_CACHE_KEY = "marketbook_businesses_cache";

export async function saveSelectedBusinessId(
  businessId: string,
): Promise<void> {
  await SecureStore.setItemAsync(SELECTED_BUSINESS_ID_KEY, businessId);
}

export async function getSelectedBusinessId(): Promise<string | null> {
  return SecureStore.getItemAsync(SELECTED_BUSINESS_ID_KEY);
}

export async function clearSelectedBusinessId(): Promise<void> {
  await SecureStore.deleteItemAsync(SELECTED_BUSINESS_ID_KEY);
}

export async function saveBusinessesCache(
  businesses: BusinessSummary[],
): Promise<void> {
  await SecureStore.setItemAsync(BUSINESSES_CACHE_KEY, JSON.stringify(businesses));
}

export async function getBusinessesCache(): Promise<BusinessSummary[]> {
  const value = await SecureStore.getItemAsync(BUSINESSES_CACHE_KEY);
  if (!value) return [];

  try {
    return JSON.parse(value) as BusinessSummary[];
  } catch {
    await SecureStore.deleteItemAsync(BUSINESSES_CACHE_KEY);
    return [];
  }
}

export async function clearBusinessesCache(): Promise<void> {
  await SecureStore.deleteItemAsync(BUSINESSES_CACHE_KEY);
}
