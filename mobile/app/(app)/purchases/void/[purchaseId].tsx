import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { voidPurchase } from "@/api/reversals";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  AuthScreen,
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import { purchaseDetailHref } from "@/navigation/hrefs";
import { canVoidPurchase } from "@/reversals/permissions";

export default function PurchaseVoidScreen() {
  const router = useRouter();
  const { purchaseId } = useLocalSearchParams<{ purchaseId: string }>();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();

  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const businessId = currentBusiness?.id;
  const role = currentBusiness?.role;
  const canVoid = role ? canVoidPurchase(role) : false;

  if (!canVoid) {
    return (
      <AuthScreen title="Void Purchase">
        <FormMessage
          type="error"
          message="You do not have permission to void purchases."
        />
        <FormButton label="Back" onPress={() => router.back()} />
      </AuthScreen>
    );
  }

  async function handleVoid() {
    if (!accessToken || !businessId || !purchaseId) {
      return;
    }

    if (!reason.trim()) {
      setErrorMessage("A reason is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(undefined);

    try {
      await voidPurchase(accessToken, businessId, purchaseId, {
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });
      router.replace(purchaseDetailHref(purchaseId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }
      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Void Purchase</Text>
        <Text style={styles.infoText}>
          This will reverse inventory received from this purchase. It can only
          continue if enough stock remains and financial conditions allow it.
        </Text>

        <FormField
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="Purchase entered by mistake"
        />
        <FormField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Additional details"
        />

        {errorMessage ? <FormMessage type="error" message={errorMessage} /> : null}

        <FormButton
          label={isSubmitting ? "Voiding..." : "Void Purchase"}
          onPress={() => void handleVoid()}
          disabled={isSubmitting}
        />
        <FormButton
          label="Cancel"
          variant="secondary"
          onPress={() => router.back()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContent: { padding: 24, gap: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700", color: "#0F172A" },
  infoText: { fontSize: 15, color: "#475569", lineHeight: 22 },
});
