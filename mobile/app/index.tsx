import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loginHref } from "@/navigation/hrefs";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>MarketBook SL</Text>
          <Text style={styles.subtitle}>
            Simple tools for managing your business
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(loginHref)}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </Pressable>
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
    fontSize: 34,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 26,
    color: "#475569",
    maxWidth: 320,
  },
  button: {
    backgroundColor: "#0F766E",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
});
