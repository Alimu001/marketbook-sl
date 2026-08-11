import { Redirect, Stack, useSegments } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { businessSelectHref, loginHref } from "@/navigation/hrefs";

export default function AppLayout() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    currentBusiness,
    businesses,
    isLoading: businessLoading,
    isInitialized,
    loadError,
    loadBusinesses,
  } = useBusiness();
  const segments = useSegments() as string[];

  if (authLoading || (isAuthenticated && !isInitialized) || businessLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0F766E" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href={loginHref} />;
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void loadBusinesses()}
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const isBusinessRoute = segments.includes("business");

  if (!currentBusiness && businesses.length > 1 && !isBusinessRoute) {
    return <Redirect href={businessSelectHref} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 24,
    gap: 16,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#0F766E",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.9,
  },
});
