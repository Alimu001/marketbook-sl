import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { appHref } from "@/navigation/hrefs";
import { createBusinessFormSchema } from "@/validation/business";

export default function CreateBusinessScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { createBusiness, businesses } = useBusiness();

  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(appHref);
  };

  const handleCreate = async () => {
    if (isSubmitting) {
      return;
    }

    setFieldError(undefined);
    setFormError(undefined);

    const parsed = createBusinessFormSchema.safeParse({ name });

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Business name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      await createBusiness(parsed.data.name);
      router.replace(appHref);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/(auth)/login");
        return;
      }

      setFormError(getUserFacingErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="Create Your Business"
      subtitle="Set up your business to start managing sales, products and records."
      isLoading={isSubmitting}
      footer={
        businesses.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={handleBack}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null
      }
    >
      <FormMessage message={formError} type="error" />

      <FormField
        label="Business Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        placeholder="Alimu Trading Enterprise"
        error={fieldError}
      />

      <FormButton
        label="Create Business"
        onPress={() => void handleCreate()}
        disabled={isSubmitting}
      />

      {businesses.length === 0 ? (
        <FormButton
          label="Back"
          variant="secondary"
          onPress={handleBack}
          disabled={isSubmitting}
        />
      ) : null}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  backText: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
  },
});
