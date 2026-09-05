import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { addBusinessMember, type BusinessRole } from "@/api/businesses";
import { getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { formatBusinessRole, useBusiness } from "@/business";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { businessMembersHref } from "@/navigation/hrefs";

const ROLES: Array<Exclude<BusinessRole, "owner">> = [
  "admin",
  "staff",
  "cashier",
];

export default function EnrollTeamMemberScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Exclude<BusinessRole, "owner">>("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const enroll = async () => {
    if (!accessToken || !currentBusiness || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await addBusinessMember(accessToken, currentBusiness.id, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      });
      router.back();
    } catch (enrollError) {
      setError(getUserFacingErrorMessage(enrollError));
    } finally {
      setSaving(false);
    }
  };

  if (currentBusiness?.role !== "owner") {
    return (
      <AuthScreen title="Enroll Team Member">
        <FormMessage message="Only the business owner can enroll members." />
        <FormButton label="Back" onPress={() => router.replace(businessMembersHref)} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Enroll Team Member"
      subtitle={`Create a login for ${currentBusiness.name}.`}
      isLoading={saving}
    >
      <FormMessage message={error} />
      <FormField label="Full Name" value={name} onChangeText={setName} autoCapitalize="words" />
      <FormField label="Login Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <FormField label="Temporary Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      <View style={styles.roleSection}>
        <Text style={styles.label}>Role</Text>
        <View style={styles.roles}>
          {ROLES.map((entry) => (
            <Pressable key={entry} onPress={() => setRole(entry)} style={[styles.roleButton, role === entry && styles.roleButtonActive]}>
              <Text style={[styles.roleText, role === entry && styles.roleTextActive]}>{formatBusinessRole(entry)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FormButton label="Enroll Member" disabled={!name.trim() || !email.trim() || !password} onPress={() => void enroll()} />
      <FormButton label="Cancel" variant="secondary" disabled={saving} onPress={() => router.back()} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  roleSection: { gap: 8 },
  label: { color: "#334155", fontSize: 14, fontWeight: "600" },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleButton: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  roleButtonActive: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  roleText: { color: "#475569", fontSize: 14, fontWeight: "600" },
  roleTextActive: { color: "#FFFFFF" },
});
