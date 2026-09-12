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
import { listSuppliers } from "@/api/suppliers";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import { FormButton, FormMessage } from "@/components/AuthScreen";
import { usePurchaseCart } from "@/suppliers";
import type { SupplierSummary } from "@/suppliers/types";
import { supplierCreateHref } from "@/navigation/hrefs";
import { useDebouncedValue } from "@/products/useDebouncedValue";

const PAGE_SIZE = 30;

export default function SelectSupplierScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { currentBusiness } = useBusiness();
  const { setSelectedSupplier } = usePurchaseCart();

  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const businessId = currentBusiness?.id;

  const loadSuppliers = useCallback(async () => {
    if (!accessToken || !businessId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const response = await listSuppliers(accessToken, businessId, {
        page: 1,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        isActive: true,
      });

      setSuppliers(response.items);
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
    void loadSuppliers();
  }, [loadSuppliers]);

  const handleSelect = (supplier: SupplierSummary) => {
    setSelectedSupplier({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
    });
    router.back();
  };

  const handleClear = () => {
    setSelectedSupplier(null);
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={styles.backLink}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Select Supplier</Text>
          <Text style={styles.subtitle}>Choose a supplier for this purchase</Text>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search suppliers..."
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
            data={suppliers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No active suppliers found.</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [
                  styles.supplierRow,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={styles.supplierName}>{item.name}</Text>
                {item.phone ? (
                  <Text style={styles.supplierMeta}>{item.phone}</Text>
                ) : null}
              </Pressable>
            )}
          />
        )}

        <View style={styles.footer}>
          <FormButton label="Clear Selection" variant="secondary" onPress={handleClear} />
          <FormButton
            label="+ New Supplier"
            onPress={() => router.push(supplierCreateHref)}
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
  supplierRow: {
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
  supplierName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  supplierMeta: {
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
