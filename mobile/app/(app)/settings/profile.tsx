import { useState } from "react";
import { useRouter } from "expo-router";
import { updateCurrentUser } from "@/api/auth";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { appHref } from "@/navigation/hrefs";
import { profileFormSchema } from "@/validation/profile";

export default function PersonalSettingsScreen() {
  const router = useRouter();
  const { user, accessToken, updateUser, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [message, setMessage] = useState<{
    type: "error" | "success";
    text: string;
  }>();
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    if (!accessToken || isSaving) return;

    setErrors({});
    setMessage(undefined);
    const parsed = profileFormSchema.safeParse({ name, email });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        name: fieldErrors.name?.[0],
        email: fieldErrors.email?.[0],
      });
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateCurrentUser(accessToken, parsed.data);
      await updateUser(updated);
      setName(updated.name ?? "");
      setEmail(updated.email);
      setMessage({ type: "success", text: "Personal details saved." });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/(auth)/login");
        return;
      }
      setMessage({ type: "error", text: getUserFacingErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthScreen
      title="Personal Settings"
      subtitle="Update the name and email used for your MarketBook account."
      isLoading={isSaving}
    >
      <FormMessage message={message?.text} type={message?.type} />
      <FormField
        label="Full Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        error={errors.name}
      />
      <FormField
        label="Login Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        error={errors.email}
      />
      <FormButton label="Save Personal Details" onPress={() => void save()} />
      <FormButton
        label="Back"
        variant="secondary"
        onPress={() => router.replace(appHref)}
      />
    </AuthScreen>
  );
}
