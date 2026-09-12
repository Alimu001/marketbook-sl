import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { AuthProvider } from "@/auth";
import { BusinessProvider } from "@/business";
import { PosCustomerProvider } from "@/customers";
import { OfflineBanner, OfflineProvider } from "@/offline";
import { PurchaseCartProvider } from "@/suppliers";
import { SaleCartProvider } from "@/sales";

export default function RootLayout() {
  return (
    <AuthProvider>
      <BusinessProvider>
        <OfflineProvider>
          <PosCustomerProvider>
            <SaleCartProvider>
              <PurchaseCartProvider>
                <StatusBar style="dark" />
                <View style={{ flex: 1 }}>
                  <OfflineBanner />
                  <Stack screenOptions={{ headerShown: false }} />
                </View>
              </PurchaseCartProvider>
            </SaleCartProvider>
          </PosCustomerProvider>
        </OfflineProvider>
      </BusinessProvider>
    </AuthProvider>
  );
}
