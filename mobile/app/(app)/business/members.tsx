import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  listBusinessMembers,
  removeBusinessMember,
  updateBusinessMemberRole,
  type BusinessMemberSummary,
  type BusinessRole,
} from "@/api/businesses";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { formatBusinessRole, useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { useFocusEffect, useRouter } from "expo-router";
import {
  businessActivitiesHref,
  businessMemberEnrollHref,
  businessMemberPasswordHref,
} from "@/navigation/hrefs";

const ASSIGNABLE_ROLES: Array<Exclude<BusinessRole, "owner">> = [
  "admin",
  "staff",
  "cashier",
];

export default function BusinessMembersScreen() {
  const router = useRouter();
  const { accessToken, user, logout } = useAuth();
  const { currentBusiness } = useBusiness();
  const [members, setMembers] = useState<BusinessMemberSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string>();
  const [message, setMessage] = useState<{
    type: "error" | "success";
    text: string;
  }>();

  const businessId = currentBusiness?.id;
  const actingRole = currentBusiness?.role;

  const loadMembers = useCallback(
    async (refreshing = false) => {
      if (!accessToken || !businessId) return;
      refreshing ? setIsRefreshing(true) : setIsLoading(true);
      setMessage(undefined);

      try {
        setMembers(await listBusinessMembers(accessToken, businessId));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout();
          return;
        }
        setMessage({ type: "error", text: getUserFacingErrorMessage(error) });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, businessId, logout],
  );

  useFocusEffect(
    useCallback(() => {
      void loadMembers();
    }, [loadMembers]),
  );

  const changeRole = async (
    member: BusinessMemberSummary,
    role: Exclude<BusinessRole, "owner">,
  ) => {
    if (!accessToken || !businessId || busyUserId || member.role === role) return;
    setBusyUserId(member.userId);
    setMessage(undefined);
    try {
      const updated = await updateBusinessMemberRole(
        accessToken,
        businessId,
        member.userId,
        role,
      );
      setMembers((current) =>
        current.map((entry) =>
          entry.userId === updated.userId ? updated : entry,
        ),
      );
      setMessage({ type: "success", text: "Member role updated." });
    } catch (error) {
      setMessage({ type: "error", text: getUserFacingErrorMessage(error) });
    } finally {
      setBusyUserId(undefined);
    }
  };

  const removeMember = async (member: BusinessMemberSummary) => {
    if (!accessToken || !businessId || busyUserId) return;
    setBusyUserId(member.userId);
    setMessage(undefined);
    try {
      await removeBusinessMember(accessToken, businessId, member.userId);
      setMembers((current) =>
        current.filter((entry) => entry.userId !== member.userId),
      );
      setMessage({ type: "success", text: "Member removed." });
    } catch (error) {
      setMessage({ type: "error", text: getUserFacingErrorMessage(error) });
    } finally {
      setBusyUserId(undefined);
    }
  };

  const confirmRemoval = (member: BusinessMemberSummary) => {
    Alert.alert(
      "Remove team member?",
      `${member.name || member.email} will lose access to this business.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void removeMember(member),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Team Members</Text>
          <Text style={styles.subtitle}>{currentBusiness?.name}</Text>
        </View>

        <FormMessage message={message?.text} type={message?.type} />

        {actingRole === "owner" ? (
          <View style={styles.topActions}>
            <FormButton
              label="Enroll Team Member"
              onPress={() => router.push(businessMemberEnrollHref)}
            />
            <FormButton
              label="View Team Activity"
              variant="secondary"
              onPress={() => router.push(businessActivitiesHref)}
            />
          </View>
        ) : null}

        {isLoading ? (
          <ActivityIndicator color="#0F766E" size="large" style={styles.loader} />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.userId}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => void loadMembers(true)}
              />
            }
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>No members found.</Text>}
            renderItem={({ item }) => {
              const isOwner = item.role === "owner";
              const isSelf = item.userId === user?.id;
              const canChangeRole = actingRole === "owner" && !isOwner && !isSelf;
              const canRemove =
                (actingRole === "owner" || actingRole === "admin") &&
                !isOwner &&
                !isSelf;

              return (
                <View style={styles.card}>
                  <View style={styles.memberHeader}>
                    <View style={styles.identity}>
                      <Text style={styles.name}>{item.name || "Unnamed user"}</Text>
                      <Text style={styles.email}>{item.email}</Text>
                    </View>
                    <Text style={styles.roleBadge}>{formatBusinessRole(item.role)}</Text>
                  </View>

                  {canChangeRole ? (
                    <View style={styles.roles}>
                      {ASSIGNABLE_ROLES.map((role) => (
                        <Pressable
                          key={role}
                          disabled={busyUserId === item.userId}
                          onPress={() => void changeRole(item, role)}
                          style={[
                            styles.roleButton,
                            item.role === role && styles.roleButtonActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleButtonText,
                              item.role === role && styles.roleButtonTextActive,
                            ]}
                          >
                            {formatBusinessRole(role)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {canRemove ? (
                    <View style={styles.memberActions}>
                      {actingRole === "owner" ? (
                        <Pressable
                          onPress={() =>
                            router.push(businessMemberPasswordHref(item.userId))
                          }
                        >
                          <Text style={styles.resetText}>Reset password</Text>
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => confirmRemoval(item)}>
                        <Text style={styles.removeText}>Remove member</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, paddingHorizontal: 18 },
  header: { paddingTop: 10, paddingBottom: 14, gap: 3 },
  title: { color: "#0F172A", fontSize: 27, fontWeight: "700" },
  subtitle: { color: "#64748B", fontSize: 15 },
  loader: { marginTop: 40 },
  topActions: { gap: 4, marginBottom: 8 },
  list: { paddingVertical: 10, paddingBottom: 30, flexGrow: 1 },
  empty: { color: "#64748B", textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  memberHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  identity: { flex: 1, gap: 3 },
  name: { color: "#0F172A", fontSize: 17, fontWeight: "700" },
  email: { color: "#64748B", fontSize: 13 },
  roleBadge: {
    color: "#0F766E",
    backgroundColor: "#CCFBF1",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700",
  },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  roleButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  roleButtonActive: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  roleButtonText: { color: "#475569", fontSize: 13, fontWeight: "600" },
  roleButtonTextActive: { color: "#FFFFFF" },
  removeText: { color: "#B91C1C", fontSize: 14, fontWeight: "700" },
  resetText: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  memberActions: { flexDirection: "row", gap: 18 },
});
