import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { resetBusinessMemberPassword } from "@/api/businesses";
import { getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { AuthScreen, FormButton, FormField, FormMessage } from "@/components/AuthScreen";

export default function ResetMemberPasswordScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const reset = async () => {
    if (!accessToken || !currentBusiness || !userId || saving) return;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await resetBusinessMemberPassword(accessToken, currentBusiness.id, userId, password);
      router.back();
    } catch (resetError) {
      setError(getUserFacingErrorMessage(resetError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthScreen title="Reset Member Password" subtitle="The member must replace this temporary password at their next login." isLoading={saving}>
      <FormMessage message={error} />
      <FormField label="Temporary Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      <FormField label="Confirm Password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />
      <FormButton label="Reset Password" disabled={!password || !confirm || saving} onPress={() => void reset()} />
      <FormButton label="Cancel" variant="secondary" onPress={() => router.back()} />
    </AuthScreen>
  );
}
