import { useRouter } from "expo-router";
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
import { loginHref, loginWithRegisteredHref } from "@/navigation/hrefs";
import { registerFormSchema } from "@/validation/auth";

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async () => {
    if (isSubmitting) {
      return;
    }

    setFormError(undefined);
    setFieldErrors({});

    const parsed = registerFormSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
    });

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
      await register({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
      });

      router.replace(loginWithRegisteredHref);
    } catch (error) {
      if (error instanceof ApiError && error.code === "EMAIL_EXISTS") {
        setFormError("An account with this email already exists.");
      } else if (error instanceof ApiError && error.status >= 500) {
        setFormError("Server is unavailable. Please try again later.");
      } else {
        setFormError(getUserFacingErrorMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="Create account"
      subtitle="Start managing your business with MarketBook SL."
      isLoading={isSubmitting}
      footer={
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(loginHref)}
        >
          <Text style={styles.linkText}>
            Already have an account?{" "}
            <Text style={styles.linkTextBold}>Sign in</Text>
          </Text>
        </Pressable>
      }
    >
      <FormMessage message={formError} type="error" />

      <FormField
        label="Full name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        textContentType="name"
        placeholder="Your name"
        error={fieldErrors.name}
      />

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
        textContentType="newPassword"
        placeholder="At least 8 characters with letters and numbers"
        error={fieldErrors.password}
      />

      <FormField
        label="Confirm password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        textContentType="newPassword"
        placeholder="Re-enter your password"
        error={fieldErrors.confirmPassword}
      />

      <FormButton
        label="Create Account"
        onPress={() => void handleRegister()}
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
