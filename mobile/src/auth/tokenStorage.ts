import * as SecureStore from "expo-secure-store";
import type { PublicUser } from "@/api/auth";

const REFRESH_TOKEN_KEY = "marketbook_refresh_token";
const OFFLINE_SESSION_KEY = "marketbook_offline_session";

export interface StoredOfflineSession {
  accessToken: string;
  user: PublicUser;
}

export async function saveRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveOfflineSession(
  session: StoredOfflineSession,
): Promise<void> {
  await SecureStore.setItemAsync(OFFLINE_SESSION_KEY, JSON.stringify(session));
}

export async function getOfflineSession(): Promise<StoredOfflineSession | null> {
  const value = await SecureStore.getItemAsync(OFFLINE_SESSION_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as StoredOfflineSession;
  } catch {
    await SecureStore.deleteItemAsync(OFFLINE_SESSION_KEY);
    return null;
  }
}

export async function clearOfflineSession(): Promise<void> {
  await SecureStore.deleteItemAsync(OFFLINE_SESSION_KEY);
}
