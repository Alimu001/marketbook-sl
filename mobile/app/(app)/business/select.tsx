import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatBusinessRole, useBusiness } from "@/business";
import { FormButton } from "@/components/AuthScreen";
import { appHref, businessCreateHref } from "@/navigation/hrefs";

export default function SelectBusinessScreen() {
  const router = useRouter();
  const { businesses, selectBusiness } = useBusiness();

  const handleSelect = async (businessId: string) => {
    const business = businesses.find((entry) => entry.id === businessId);

    if (!business) {
      return;
    }

    await selectBusiness(business);
    router.replace(appHref);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>MarketBook SL</Text>
          <Text style={styles.title}>Choose a Business</Text>
          <Text style={styles.subtitle}>
            Select which business you want to manage.
          </Text>
        </View>

        <View style={styles.list}>
          {businesses.map((business) => (
            <Pressable
              key={business.id}
              accessibilityRole="button"
              onPress={() => void handleSelect(business.id)}
              style={({ pressed }) => [
                styles.businessCard,
                pressed && styles.cardPressed,
              ]}
            >
              <Text style={styles.businessName}>{business.name}</Text>
              <Text style={styles.businessRole}>
                {formatBusinessRole(business.role)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.actions}>
          <FormButton
            label="+ Create Another Business"
            variant="secondary"
            onPress={() => router.push(businessCreateHref)}
          />
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
  header: {
    paddingTop: 16,
    gap: 8,
  },
  brand: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F766E",
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "#475569",
  },
  list: {
    flex: 1,
    paddingVertical: 24,
    gap: 12,
  },
  businessCard: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 4,
  },
  cardPressed: {
    opacity: 0.92,
  },
  businessName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  businessRole: {
    fontSize: 15,
    color: "#475569",
    fontWeight: "600",
  },
  actions: {
    gap: 12,
  },
});
