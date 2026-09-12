import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { createSupplier } from "@/offline/repositories/suppliers.repository";
import { useOffline } from "@/offline";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { canCreateSupplier } from "@/suppliers";
import { suppliersHref } from "@/navigation/hrefs";
import { z } from "zod";

const createSupplierFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().max(254).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
});

export default function CreateSupplierScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();
  const { getScope, networkStatus } = useOffline();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const role = currentBusiness?.role;
  const canCreate = role ? canCreateSupplier(role) : false;

  if (!canCreate) {
    return (
      <AuthScreen
        title="Add Supplier"
        subtitle="You do not have permission to create suppliers."
      >
        <FormMessage
          message="Your role cannot create suppliers."
          type="error"
        />
        <FormButton
          label="Back to Suppliers"
          onPress={() => router.replace(suppliersHref)}
        />
      </AuthScreen>
    );
  }

  const handleSubmit = async () => {
    const scope = getScope();
    if (isSubmitting || !accessToken || !currentBusiness || !scope) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    const parsed = createSupplierFormSchema.safeParse({
      name,
      phone: phone || undefined,
      email: email || undefined,
      address: address || undefined,
      notes: notes || undefined,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? "form";
        if (!errors[key]) {
          errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      await createSupplier(scope, networkStatus, parsed.data);
      router.replace({
        pathname: suppliersHref,
        params: { created: "1" },
      } as never);
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
      title="Add Supplier"
      subtitle="Create a supplier for purchase and payable tracking."
      isLoading={isSubmitting}
      footer={
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      }
    >
      <FormMessage message={formError} type="error" />

      <FormField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Supplier name"
        error={fieldErrors.name}
      />

      <FormField
        label="Phone (optional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+232..."
        error={fieldErrors.phone}
      />

      <FormField
        label="Email (optional)"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="supplier@example.com"
        error={fieldErrors.email}
      />

      <FormField
        label="Address (optional)"
        value={address}
        onChangeText={setAddress}
        multiline
        placeholder="Address"
        error={fieldErrors.address}
      />

      <FormField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Notes about this supplier"
        error={fieldErrors.notes}
      />

      <FormButton
        label="Create Supplier"
        onPress={() => void handleSubmit()}
        disabled={isSubmitting}
      />
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
