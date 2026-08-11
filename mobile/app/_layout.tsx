import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/auth";
import { BusinessProvider } from "@/business";
import { PosCustomerProvider } from "@/customers";
import { SaleCartProvider } from "@/sales";

export default function RootLayout() {
  return (
    <AuthProvider>
      <BusinessProvider>
        <PosCustomerProvider>
          <SaleCartProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
          </SaleCartProvider>
        </PosCustomerProvider>
      </BusinessProvider>
    </AuthProvider>
  );
}
