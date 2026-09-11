import { useState } from "react";
import { useRouter } from "expo-router";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth";
import {
  canManageBusiness,
  canViewFinancialReports,
  canViewTeamMembers,
  useBusiness,
} from "@/business";
import {
  appHref,
  businessMembersHref,
  businessSelectHref,
  businessSettingsHref,
  customersHref,
  debtsHref,
  expensesHref,
  inventoryHref,
  paymentsHref,
  payablesHref,
  personalSettingsHref,
  passwordSettingsHref,
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
  ["Customer Debts", debtsHref],
  ["Purchases", purchasesHref],
  ["Suppliers", suppliersHref],
  ["Supplier Payables", payablesHref],
  ["Expenses", expensesHref],
  ["Payments", paymentsHref],
  ["Reports", reportsHref],
  ["Offline & Sync", syncHref],
] as const;

export function AppSidePanel() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const currentRole = currentBusiness?.role;
  const [servicesOpen, setServicesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const visibleLinks = links.filter(
    ([label]) => label !== "Reports" || canViewFinancialReports(currentRole),
  );

  const navigate = (
    href:
      | (typeof links)[number][1]
      | typeof personalSettingsHref
      | typeof passwordSettingsHref
      | typeof businessMembersHref
      | typeof businessSelectHref
      | typeof businessSettingsHref,
  ) => {
    setServicesOpen(false);
    setSettingsOpen(false);
    router.push(href);
  };

  return (
    <>
      <View
        style={[styles.toolbar, { paddingTop: insets.top + 6 }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open services menu"
          onPress={() => setServicesOpen(true)}
          style={styles.menuButton}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </Pressable>

        <Text style={styles.toolbarTitle}>MarketBook SL</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings menu"
          onPress={() => setSettingsOpen(true)}
          style={styles.menuButton}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>

      <Modal
        visible={servicesOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setServicesOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setServicesOpen(false)}
          />
          <View
            style={[
              styles.panel,
              {
                paddingTop: insets.top + 18,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={styles.panelHeader}>
              <Text style={styles.brand}>Services</Text>
              <Pressable
                accessibilityLabel="Close services menu"
                onPress={() => setServicesOpen(false)}
              >
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.businessName}>{currentBusiness?.name ?? "No business selected"}</Text>
            <Text style={styles.userName}>{user?.name || user?.email}</Text>

            <View style={styles.serviceGrid}>
              {visibleLinks.map(([label, href]) => (
                <Pressable
                  key={label}
                  style={styles.serviceLink}
                  onPress={() => navigate(href)}
                >
                  <Text style={styles.serviceLinkText}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={styles.modalRootRight}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setSettingsOpen(false)}
          />
          <View
            style={[
              styles.panel,
              {
                paddingTop: insets.top + 18,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={styles.panelHeader}>
              <Text style={styles.brand}>Settings</Text>
              <Pressable
                accessibilityLabel="Close settings menu"
                onPress={() => setSettingsOpen(false)}
              >
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.businessName}>{currentBusiness?.name ?? "No business selected"}</Text>
            <Text style={styles.userName}>{user?.name || user?.email}</Text>

            <View style={styles.links}>
              <Pressable style={styles.link} onPress={() => navigate(personalSettingsHref)}>
                <Text style={styles.linkText}>Personal Settings</Text>
              </Pressable>
              <Pressable style={styles.link} onPress={() => navigate(passwordSettingsHref)}>
                <Text style={styles.linkText}>Change Password</Text>
              </Pressable>
              {currentBusiness && canViewTeamMembers(currentRole) ? (
                  <Pressable
                    style={styles.link}
                    onPress={() => navigate(businessMembersHref)}
                  >
                    <Text style={styles.linkText}>Team Members</Text>
                  </Pressable>
              ) : null}
              {currentBusiness && canManageBusiness(currentRole) ? (
                  <Pressable
                    style={styles.link}
                    onPress={() => navigate(businessSettingsHref)}
                  >
                    <Text style={styles.linkText}>Business Settings</Text>
                  </Pressable>
              ) : null}
              {businesses.some((business) => business.role === "owner") &&
              businesses.length > 1 ? (
                <Pressable
                  style={styles.link}
                  onPress={() => navigate(businessSelectHref)}
                >
                  <Text style={styles.linkText}>Switch Business</Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={styles.signOut}
              onPress={() => {
                setSettingsOpen(false);
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
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 8,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  toolbarTitle: { color: "#0F766E", fontSize: 17, fontWeight: "800" },
  menuButton: {
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
  settingsIcon: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  modalRoot: { flex: 1, flexDirection: "row" },
  modalRootRight: { flex: 1, flexDirection: "row-reverse" },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },
  panel: {
    width: "82%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { color: "#0F766E", fontSize: 20, fontWeight: "800" },
  close: { color: "#334155", fontSize: 34, lineHeight: 38, paddingHorizontal: 8 },
  businessName: { marginTop: 18, color: "#0F172A", fontSize: 18, fontWeight: "700" },
  userName: { marginTop: 4, color: "#64748B", fontSize: 14 },
  links: { marginTop: 18 },
  serviceGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  serviceLink: {
    width: "48%",
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    backgroundColor: "#F0FDFA",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceLinkText: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  link: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  linkText: { color: "#1E293B", fontSize: 16, fontWeight: "600" },
  signOut: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  signOutText: { color: "#B91C1C", fontSize: 16, fontWeight: "700" },
});
