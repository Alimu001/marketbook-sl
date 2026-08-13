import { StyleSheet, Text, View } from "react-native";
import { useOffline } from "./OfflineProvider";

export function OfflineBanner() {
  const { bannerState, bannerMessage } = useOffline();

  if (bannerState === "hidden" || !bannerMessage) {
    return null;
  }

  const backgroundColor =
    bannerState === "offline"
      ? "#92400E"
      : bannerState === "syncing"
        ? "#1D4ED8"
        : bannerState === "synced"
          ? "#047857"
          : "#B91C1C";

  return (
    <View style={[styles.banner, { backgroundColor }]}>
      <Text style={styles.text}>{bannerMessage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});
