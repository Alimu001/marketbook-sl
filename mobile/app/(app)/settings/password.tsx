import { useState } from "react";
import { useRouter } from "expo-router";
import { changeCurrentPassword } from "@/api/auth";
import { getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { AuthScreen, FormButton, FormField, FormMessage } from "@/components/AuthScreen";
import { appHref } from "@/navigation/hrefs";

export default function PasswordSettingsScreen() {
  const router = useRouter();
  const { user, accessToken, updateUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string }>();

  const save = async () => {
    if (!accessToken || saving) return;
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "New passwords do not match." });
      return;
    }
    setSaving(true);
    setMessage(undefined);
    try {
      const updated = await changeCurrentPassword(accessToken, { currentPassword, newPassword });
      await updateUser(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ type: "success", text: "Password changed successfully." });
      router.replace(appHref);
    } catch (error) {
      setMessage({ type: "error", text: getUserFacingErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthScreen
      title={user?.mustChangePassword ? "Create Your Password" : "Change Password"}
      subtitle={user?.mustChangePassword ? "Replace the temporary password before continuing." : "Update your account password securely."}
      isLoading={saving}
    >
      <FormMessage message={message?.text} type={message?.type} />
      <FormField label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" />
      <FormField label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" placeholder="At least 8 characters with a number" />
      <FormField label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" />
      <FormButton label="Save Password" disabled={!currentPassword || !newPassword || !confirmPassword || saving} onPress={() => void save()} />
      {!user?.mustChangePassword ? <FormButton label="Cancel" variant="secondary" onPress={() => router.back()} /> : null}
    </AuthScreen>
  );
}
