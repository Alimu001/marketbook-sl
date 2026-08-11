import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/auth";
import { BusinessProvider } from "@/business";
import { SaleCartProvider } from "@/sales";

export default function RootLayout() {
  return (
    <AuthProvider>
      <BusinessProvider>
        <SaleCartProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </SaleCartProvider>
      </BusinessProvider>
    </AuthProvider>
  );
}
