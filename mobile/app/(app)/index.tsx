import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth";
import { FormButton } from "@/components/AuthScreen";

export default function AppHomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Welcome to MarketBook SL</Text>
          <Text style={styles.subtitle}>
            You are signed in{user?.name ? ` as ${user.name}` : ""}.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Create Business</Text>
          </Pressable>

          <FormButton label="Sign Out" onPress={() => void handleLogout()} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 26,
    color: "#475569",
  },
  actions: {
    gap: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#0F766E",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: {
    color: "#0F766E",
    fontSize: 17,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.9,
  },
});
