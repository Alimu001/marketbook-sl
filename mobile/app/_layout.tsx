import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/auth";
import { BusinessProvider } from "@/business";

export default function RootLayout() {
  return (
    <AuthProvider>
      <BusinessProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </BusinessProvider>
    </AuthProvider>
  );
}
