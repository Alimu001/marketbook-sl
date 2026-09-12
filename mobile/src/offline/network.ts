import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import type { NetworkStatus } from "./types";

export function mapNetInfoState(state: NetInfoState): NetworkStatus {
  if (state.isConnected == null) {
    return "UNKNOWN";
  }

  return state.isConnected && state.isInternetReachable !== false
    ? "ONLINE"
    : "OFFLINE";
}

export async function getCurrentNetworkStatus(): Promise<NetworkStatus> {
  const state = await NetInfo.fetch();
  return mapNetInfoState(state);
}

export function subscribeToNetworkStatus(
  listener: (status: NetworkStatus) => void,
): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    listener(mapNetInfoState(state));
  });

  return unsubscribe;
}

export function isOnlineStatus(status: NetworkStatus): boolean {
  return status === "ONLINE";
}
