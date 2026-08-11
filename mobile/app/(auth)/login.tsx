import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { appHref, registerHref } from "@/navigation/hrefs";
import { loginFormSchema } from "@/validation/auth";

export default function LoginScreen() {
  const router = useRouter();
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>(
    registered ? "Account created successfully. Please sign in." : undefined,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (isSubmitting) {
      return;
    }

    setFormError(undefined);
    setSuccessMessage(undefined);
    setFieldErrors({});

    const parsed = loginFormSchema.safeParse({ email, password });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? "form";
        errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      await login(parsed.data.email, parsed.data.password);
      router.replace(appHref);
    } catch (error) {
      setFormError(getUserFacingErrorMessage(error));
      if (error instanceof ApiError && error.status >= 500) {
        setFormError("Server is unavailable. Please try again later.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="Sign in"
      subtitle="Access your business tools securely."
      isLoading={isSubmitting}
      footer={
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(registerHref)}
        >
          <Text style={styles.linkText}>
            Don&apos;t have an account?{" "}
            <Text style={styles.linkTextBold}>Create one</Text>
          </Text>
        </Pressable>
      }
    >
      <FormMessage message={successMessage} type="success" />
      <FormMessage message={formError} type="error" />

      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
        error={fieldErrors.email}
      />

      <FormField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        placeholder="Enter your password"
        error={fieldErrors.password}
      />

      <FormButton
        label="Sign In"
        onPress={() => void handleLogin()}
        disabled={isSubmitting}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  linkText: {
    color: "#475569",
    fontSize: 15,
  },
  linkTextBold: {
    color: "#0F766E",
    fontWeight: "700",
  },
});
