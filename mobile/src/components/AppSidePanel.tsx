import { useState } from "react";
import { useRouter } from "expo-router";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  appHref,
  businessSettingsHref,
  customersHref,
  expensesHref,
  inventoryHref,
  paymentsHref,
  personalSettingsHref,
  productsHref,
  purchasesHref,
  reportsHref,
  salesHref,
  suppliersHref,
  syncHref,
} from "@/navigation/hrefs";

const links = [
  ["Dashboard", appHref],
  ["Sales", salesHref],
  ["Products", productsHref],
  ["Inventory", inventoryHref],
  ["Customers", customersHref],
  ["Purchases", purchasesHref],
  ["Suppliers", suppliersHref],
  ["Expenses", expensesHref],
  ["Payments", paymentsHref],
  ["Reports", reportsHref],
  ["Offline & Sync", syncHref],
] as const;

export function AppSidePanel() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { currentBusiness } = useBusiness();
  const [open, setOpen] = useState(false);

  const navigate = (href: (typeof links)[number][1] | typeof personalSettingsHref | typeof businessSettingsHref) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open navigation menu"
        onPress={() => setOpen(true)}
        style={[styles.menuButton, { top: insets.top + 8 }]}
      >
        <Text style={styles.menuIcon}>☰</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={[styles.panel, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.panelHeader}>
              <Text style={styles.brand}>MarketBook SL</Text>
              <Pressable accessibilityLabel="Close navigation menu" onPress={() => setOpen(false)}>
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.businessName}>{currentBusiness?.name ?? "No business selected"}</Text>
            <Text style={styles.userName}>{user?.name || user?.email}</Text>

            <ScrollView style={styles.links} showsVerticalScrollIndicator={false}>
              {links.map(([label, href]) => (
                <Pressable key={label} style={styles.link} onPress={() => navigate(href)}>
                  <Text style={styles.linkText}>{label}</Text>
                </Pressable>
              ))}
              <View style={styles.divider} />
              <Pressable style={styles.link} onPress={() => navigate(personalSettingsHref)}>
                <Text style={styles.linkText}>Personal Settings</Text>
              </Pressable>
              {currentBusiness ? (
                <Pressable style={styles.link} onPress={() => navigate(businessSettingsHref)}>
                  <Text style={styles.linkText}>Business Settings</Text>
                </Pressable>
              ) : null}
            </ScrollView>

            <Pressable
              style={styles.signOut}
              onPress={() => {
                setOpen(false);
                void logout().then(() => router.replace("/(auth)/login"));
              }}
            >
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    position: "absolute",
    right: 14,
    zIndex: 100,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 5,
  },
  menuIcon: { color: "#FFFFFF", fontSize: 23, fontWeight: "700" },
  modalRoot: { flex: 1, flexDirection: "row" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 23, 42, 0.48)" },
  panel: { width: "82%", maxWidth: 340, backgroundColor: "#FFFFFF", paddingHorizontal: 20 },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: "#0F766E", fontSize: 20, fontWeight: "800" },
  close: { color: "#334155", fontSize: 34, lineHeight: 38, paddingHorizontal: 8 },
  businessName: { marginTop: 18, color: "#0F172A", fontSize: 18, fontWeight: "700" },
  userName: { marginTop: 4, color: "#64748B", fontSize: 14 },
  links: { marginTop: 18 },
  link: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  linkText: { color: "#1E293B", fontSize: 16, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 8 },
  signOut: { marginTop: 12, borderWidth: 1, borderColor: "#FCA5A5", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  signOutText: { color: "#B91C1C", fontSize: 16, fontWeight: "700" },
});
