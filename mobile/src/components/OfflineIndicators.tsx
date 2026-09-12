import { StyleSheet, Text, View } from "react-native";
import { isLocalId } from "@/offline";

export function PendingSyncBadge({ entityId }: { entityId: string }) {
  if (!isLocalId(entityId)) {
    return null;
  }

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>Pending Sync</Text>
    </View>
  );
}

export function OfflineDataHint({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return <Text style={styles.hint}>Offline data</Text>;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  text: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "700",
  },
  hint: {
    color: "#92400E",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
});
