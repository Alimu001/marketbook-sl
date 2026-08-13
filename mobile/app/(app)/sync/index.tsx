import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { appHref } from "@/navigation/hrefs";
import {
  discardSyncQueueItem,
  listSyncQueueItems,
  retrySyncQueueItem,
  useOffline,
  type SyncQueueItem,
} from "@/offline";

function formatOperation(item: SyncQueueItem): string {
  switch (item.operationType) {
    case "CREATE_CUSTOMER":
      return "Create customer";
    case "CREATE_SUPPLIER":
      return "Create supplier";
    case "CREATE_EXPENSE":
      return "Create expense";
    default:
      return item.operationType;
  }
}

function formatStatus(status: SyncQueueItem["status"]): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "SYNCING":
      return "Syncing";
    case "SYNCED":
      return "Synced";
    case "FAILED":
      return "Failed";
    case "CONFLICT":
      return "Conflict";
    default:
      return status;
  }
}

export default function SyncStatusScreen() {
  const router = useRouter();
  const { getScope, isSyncing, isOnline, pendingCount, syncNow } = useOffline();
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadItems = useCallback(async () => {
    const scope = getScope();

    if (!scope) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const queueItems = await listSyncQueueItems(
        scope.userId,
        scope.businessId,
      );
      setItems(queueItems);
    } catch {
      setErrorMessage("Unable to load sync queue.");
    } finally {
      setIsLoading(false);
    }
  }, [getScope]);

  useFocusEffect(
    useCallback(() => {
      void loadItems();
    }, [loadItems]),
  );

  const handleRetry = async (item: SyncQueueItem) => {
    const scope = getScope();
    if (!scope || !isOnline) {
      return;
    }

    await retrySyncQueueItem(scope, item.localId);
    await loadItems();
  };

  const handleDiscard = (item: SyncQueueItem) => {
    const scope = getScope();
    if (!scope) {
      return;
    }

    Alert.alert(
      "Discard local change?",
      "This removes the unsynced item from this device. Server data is not deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            void discardSyncQueueItem({
              scope,
              localId: item.localId,
              entityType: item.entityType,
              entityLocalId: item.entityLocalId,
            }).then(loadItems);
          },
        },
      ],
    );
  };

  const grouped = {
    pending: items.filter((item) => item.status === "PENDING" || item.status === "SYNCING"),
    synced: items.filter((item) => item.status === "SYNCED"),
    failed: items.filter((item) => item.status === "FAILED"),
    conflicts: items.filter((item) => item.status === "CONFLICT"),
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.replace(appHref)}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Sync Status</Text>
        <Text style={styles.subtitle}>
          Device-local queue for this business ({pendingCount} need attention)
        </Text>
      </View>

      <FormMessage message={errorMessage} type="error" />

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>Pending: {grouped.pending.length}</Text>
        <Text style={styles.summaryText}>Synced: {grouped.synced.length}</Text>
        <Text style={styles.summaryText}>Failed: {grouped.failed.length}</Text>
        <Text style={styles.summaryText}>Conflicts: {grouped.conflicts.length}</Text>
      </View>

      <FormButton
        label={isSyncing ? "Syncing..." : "Sync Now"}
        onPress={() => {
          void syncNow().then(loadItems);
        }}
        disabled={!isOnline || isSyncing}
      />

      {isLoading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#0F766E" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.localId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No sync queue items on this device.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{formatOperation(item)}</Text>
              <Text style={styles.cardMeta}>Status: {formatStatus(item.status)}</Text>
              <Text style={styles.cardMeta}>
                Created: {new Date(item.createdAt).toLocaleString()}
              </Text>
              {item.lastError ? (
                <Text style={styles.errorText}>{item.lastError}</Text>
              ) : null}

              {item.status === "FAILED" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleRetry(item)}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionText}>Retry</Text>
                </Pressable>
              ) : null}

              {item.status === "CONFLICT" || item.status === "FAILED" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleDiscard(item)}
                  style={styles.discardButton}
                >
                  <Text style={styles.discardText}>Discard Local Change</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 16,
  },
  header: {
    paddingVertical: 16,
    gap: 8,
  },
  backText: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
    lineHeight: 22,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  summaryText: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: "#334155",
    fontSize: 13,
    fontWeight: "600",
  },
  loader: {
    marginTop: 24,
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  emptyText: {
    textAlign: "center",
    color: "#64748B",
    marginTop: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardMeta: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 14,
  },
  errorText: {
    marginTop: 8,
    color: "#B91C1C",
    fontSize: 14,
  },
  actionButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  discardButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  discardText: {
    color: "#B91C1C",
    fontWeight: "700",
  },
});
