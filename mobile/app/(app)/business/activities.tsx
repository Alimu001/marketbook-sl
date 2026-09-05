import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  listBusinessActivities,
  listBusinessMembers,
  type BusinessActivitySummary,
  type BusinessMemberSummary,
} from "@/api/businesses";
import { getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormMessage } from "@/components/AuthScreen";

function describeActivity(item: BusinessActivitySummary): string {
  const section = item.path.split("/").filter(Boolean).at(4) ?? "business";
  const verbs: Record<string, string> = { POST: "created", PATCH: "updated", PUT: "updated", DELETE: "removed" };
  return `${verbs[item.method] ?? item.method.toLowerCase()} ${section}`;
}

export default function BusinessActivitiesScreen() {
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [members, setMembers] = useState<BusinessMemberSummary[]>([]);
  const [activities, setActivities] = useState<BusinessActivitySummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!accessToken || !currentBusiness) return;
    setLoading(true);
    setError(undefined);
    try {
      const [memberData, activityData] = await Promise.all([
        listBusinessMembers(accessToken, currentBusiness.id),
        listBusinessActivities(accessToken, currentBusiness.id, {
          userId: selectedUserId,
          limit: 100,
        }),
      ]);
      setMembers(memberData);
      setActivities(activityData.items);
    } catch (loadError) {
      setError(getUserFacingErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [accessToken, currentBusiness, selectedUserId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Team Activity</Text>
        <Text style={styles.subtitle}>Successful business changes recorded from now onward.</Text>
        <View style={styles.filters}>
          <Pressable onPress={() => setSelectedUserId(undefined)} style={[styles.chip, !selectedUserId && styles.chipActive]}>
            <Text style={[styles.chipText, !selectedUserId && styles.chipTextActive]}>Everyone</Text>
          </Pressable>
          {members.map((member) => (
            <Pressable key={member.userId} onPress={() => setSelectedUserId(member.userId)} style={[styles.chip, selectedUserId === member.userId && styles.chipActive]}>
              <Text style={[styles.chipText, selectedUserId === member.userId && styles.chipTextActive]}>{member.name || member.email}</Text>
            </Pressable>
          ))}
        </View>
        <FormMessage message={error} />
        {loading ? <ActivityIndicator color="#0F766E" size="large" style={styles.loader} /> : (
          <FlatList
            data={activities}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.empty}>No recorded activity yet.</Text>}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.action}>{describeActivity(item)}</Text>
                <Text style={styles.actor}>{item.actorName || item.actorEmail}</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 10 },
  title: { color: "#0F172A", fontSize: 27, fontWeight: "700" },
  subtitle: { color: "#64748B", fontSize: 14, marginTop: 3, marginBottom: 12 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#FFFFFF" },
  chipActive: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  chipText: { color: "#475569", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF" },
  loader: { marginTop: 40 },
  list: { paddingVertical: 6, paddingBottom: 30, flexGrow: 1 },
  empty: { color: "#64748B", textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 13, marginBottom: 8, gap: 3 },
  action: { color: "#0F172A", fontSize: 15, fontWeight: "700", textTransform: "capitalize" },
  actor: { color: "#334155", fontSize: 13 },
  date: { color: "#64748B", fontSize: 12 },
});
