import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { listCustomers } from "@/api/customers";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { usePosCustomer } from "@/customers";
import type { CustomerSummary } from "@/customers/types";
import { customerCreateHref } from "@/navigation/hrefs";
import { useDebouncedValue } from "@/products/useDebouncedValue";

const PAGE_SIZE = 30;

export default function SelectCustomerScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const { setSelectedCustomer } = usePosCustomer();

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const businessId = currentBusiness?.id;

  const loadCustomers = useCallback(async () => {
    if (!accessToken || !businessId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const response = await listCustomers(accessToken, businessId, {
        page: 1,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        isActive: true,
      });

      setCustomers(response.items);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/(auth)/login");
        return;
      }

      setErrorMessage(getUserFacingErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, businessId, debouncedSearch, router]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const handleSelect = (customer: CustomerSummary) => {
    setSelectedCustomer({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
    });
    router.back();
  };

  const handleClear = () => {
    setSelectedCustomer(null);
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={styles.backLink}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Select Customer</Text>
          <Text style={styles.subtitle}>Choose a customer for this sale</Text>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search customers..."
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <FormMessage message={errorMessage} type="error" />

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0F766E" />
          </View>
        ) : (
          <FlatList
            data={customers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No active customers found.</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [
                  styles.customerRow,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={styles.customerName}>{item.name}</Text>
                {item.phone ? (
                  <Text style={styles.customerMeta}>{item.phone}</Text>
                ) : null}
              </Pressable>
            )}
          />
        )}

        <View style={styles.footer}>
          <FormButton label="Clear Selection" variant="secondary" onPress={handleClear} />
          <FormButton
            label="+ New Customer"
            onPress={() => router.push(customerCreateHref)}
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
  },
  header: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 4,
  },
  backLink: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
    marginBottom: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: 16,
    flexGrow: 1,
  },
  customerRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 10,
    gap: 4,
  },
  rowPressed: {
    opacity: 0.92,
  },
  customerName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  customerMeta: {
    fontSize: 14,
    color: "#64748B",
  },
  emptyText: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 15,
    marginTop: 32,
  },
  footer: {
    paddingVertical: 16,
    gap: 10,
  },
});
