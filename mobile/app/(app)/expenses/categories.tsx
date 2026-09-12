import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  archiveExpenseCategory,
  createExpenseCategory,
  listExpenseCategories,
  restoreExpenseCategory,
  updateExpenseCategory,
} from "@/api/expenses";
import { ApiError } from "@/api/errors";
import { getUserFacingErrorMessage, useAuth } from "@/auth";
import { useBusiness } from "@/business";
import {
  FormButton,
  FormField,
  FormMessage,
} from "@/components/AuthScreen";
import {
  canManageExpenseCategories,
  type ExpenseCategorySummary,
} from "@/expenses";
import { expensesHref } from "@/navigation/hrefs";

export default function ExpenseCategoriesScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const { currentBusiness } = useBusiness();

  const [categories, setCategories] = useState<ExpenseCategorySummary[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | undefined>();
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();

  const role = currentBusiness?.role;
  const canManage = role ? canManageExpenseCategories(role) : false;

  const loadCategories = useCallback(
    async (refreshing = false) => {
      if (!accessToken || !currentBusiness) {
        return;
      }

      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage(undefined);

      try {
        const response = await listExpenseCategories(
          accessToken,
          currentBusiness.id,
        );
        setCategories(response);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await logout();
          router.replace("/(auth)/login");
          return;
        }

        setErrorMessage(getUserFacingErrorMessage(error));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, currentBusiness, logout, router],
  );

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  if (!canManage) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Expense Categories</Text>
          <FormMessage
            message="Only owners and admins can manage expense categories."
            type="error"
          />
          <FormButton
            label="Back to Expenses"
            onPress={() => router.replace(expensesHref)}
          />
        </View>
      </SafeAreaView>
    );
  }

  const handleCreate = async () => {
    if (isSaving || !accessToken || !currentBusiness) {
      return;
    }

    setFormError(undefined);

    if (!newName.trim()) {
      setFormError("Category name is required.");
      return;
    }

    setIsSaving(true);

    try {
      await createExpenseCategory(accessToken, currentBusiness.id, {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      setNewName("");
      setNewDescription("");
      await loadCategories();
    } catch (error) {
      setFormError(getUserFacingErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (category: ExpenseCategorySummary) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditDescription(category.description ?? "");
  };

  const handleSaveEdit = async (categoryId: string) => {
    if (isSaving || !accessToken || !currentBusiness) {
      return;
    }

    setIsSaving(true);
    setFormError(undefined);

    try {
      await updateExpenseCategory(accessToken, currentBusiness.id, categoryId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setEditingId(undefined);
      await loadCategories();
    } catch (error) {
      setFormError(getUserFacingErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveToggle = (category: ExpenseCategorySummary) => {
    if (!accessToken || !currentBusiness) {
      return;
    }

    const action = category.isActive ? "archive" : "restore";

    Alert.alert(
      category.isActive ? "Archive Category" : "Restore Category",
      category.isActive
        ? "Archived categories cannot be used for new expenses."
        : "Restore this category for new expenses?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: category.isActive ? "Archive" : "Restore",
          style: category.isActive ? "destructive" : "default",
          onPress: () => {
            void (async () => {
              setIsSaving(true);
              try {
                if (category.isActive) {
                  await archiveExpenseCategory(
                    accessToken,
                    currentBusiness.id,
                    category.id,
                  );
                } else {
                  await restoreExpenseCategory(
                    accessToken,
                    currentBusiness.id,
                    category.id,
                  );
                }
                await loadCategories();
              } catch (error) {
                setFormError(getUserFacingErrorMessage(error));
              } finally {
                setIsSaving(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Expense Categories</Text>
        <Text style={styles.subtitle}>{currentBusiness?.name}</Text>

        <FormMessage message={formError} type="error" />
        <FormMessage message={errorMessage} type="error" />

        <View style={styles.createSection}>
          <FormField
            label="New Category Name"
            value={newName}
            onChangeText={setNewName}
          />
          <FormField
            label="Description (optional)"
            value={newDescription}
            onChangeText={setNewDescription}
          />
          <FormButton
            label="Add Category"
            onPress={() => void handleCreate()}
            disabled={isSaving}
          />
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#0F766E" />
        ) : (
          <FlatList
            data={categories}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => void loadCategories(true)}
              />
            }
            renderItem={({ item }) => (
              <View style={styles.categoryCard}>
                {editingId === item.id ? (
                  <>
                    <FormField
                      label="Name"
                      value={editName}
                      onChangeText={setEditName}
                    />
                    <FormField
                      label="Description"
                      value={editDescription}
                      onChangeText={setEditDescription}
                    />
                    <View style={styles.actionRow}>
                      <FormButton
                        label="Save"
                        onPress={() => void handleSaveEdit(item.id)}
                        disabled={isSaving}
                      />
                      <FormButton
                        label="Cancel"
                        variant="secondary"
                        onPress={() => setEditingId(undefined)}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryName}>{item.name}</Text>
                      <Text
                        style={[
                          styles.statusBadge,
                          item.isActive
                            ? styles.statusActive
                            : styles.statusArchived,
                        ]}
                      >
                        {item.isActive ? "Active" : "Archived"}
                      </Text>
                    </View>
                    {item.description ? (
                      <Text style={styles.categoryDescription}>
                        {item.description}
                      </Text>
                    ) : null}
                    <View style={styles.actionRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => startEditing(item)}
                        style={styles.textAction}
                      >
                        <Text style={styles.textActionLabel}>Rename</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => handleArchiveToggle(item)}
                        style={styles.textAction}
                      >
                        <Text style={styles.textActionLabel}>
                          {item.isActive ? "Archive" : "Restore"}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            )}
            contentContainerStyle={styles.listContent}
          />
        )}
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
    paddingTop: 8,
  },
  backLink: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 15,
    color: "#64748B",
    marginBottom: 16,
  },
  createSection: {
    marginBottom: 16,
    gap: 8,
  },
  listContent: {
    paddingBottom: 24,
  },
  categoryCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  categoryName: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  categoryDescription: {
    fontSize: 14,
    color: "#64748B",
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusActive: {
    backgroundColor: "#DCFCE7",
    color: "#166534",
  },
  statusArchived: {
    backgroundColor: "#F1F5F9",
    color: "#64748B",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  textAction: {
    paddingVertical: 4,
  },
  textActionLabel: {
    color: "#0F766E",
    fontSize: 14,
    fontWeight: "700",
  },
});
