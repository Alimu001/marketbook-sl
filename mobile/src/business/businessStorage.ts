import * as SecureStore from "expo-secure-store";

const SELECTED_BUSINESS_ID_KEY = "marketbook_selected_business_id";

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
