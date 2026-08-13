import type {
  ExpenseCategorySummary,
} from "@marketbook/shared/types";
import type {
  CreateExpenseCategoryInput,
  ListExpenseCategoriesQuery,
  UpdateExpenseCategoryInput,
} from "@marketbook/shared/validation";
import type { ExpenseCategory } from "../../../generated/prisma/client.js";
import { mapPrismaError } from "../../lib/prismaErrors.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

function toExpenseCategorySummary(
  category: ExpenseCategory,
): ExpenseCategorySummary {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

async function findDuplicateCategoryName(
  businessId: string,
  name: string,
  excludeCategoryId?: string,
): Promise<ExpenseCategory | null> {
  return prisma.expenseCategory.findFirst({
    where: {
      businessId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeCategoryId ? { id: { not: excludeCategoryId } } : {}),
    },
  });
}

export async function assertExpenseCategoryInBusiness(
  businessId: string,
  categoryId: string,
  options: { requireActive?: boolean } = {},
): Promise<ExpenseCategory> {
  const category = await prisma.expenseCategory.findFirst({
    where: {
      id: categoryId,
      businessId,
    },
  });

  if (!category) {
    throw new AppError(
      404,
      "Expense category not found",
      "EXPENSE_CATEGORY_NOT_FOUND",
    );
  }

  if (options.requireActive && !category.isActive) {
    throw new AppError(
      409,
      "Expense category is archived and cannot be used",
      "EXPENSE_CATEGORY_INACTIVE",
    );
  }

  return category;
}

export async function createExpenseCategory(
  businessId: string,
  input: CreateExpenseCategoryInput,
): Promise<ExpenseCategorySummary> {
  const duplicate = await findDuplicateCategoryName(businessId, input.name);

  if (duplicate) {
    throw new AppError(
      409,
      "An expense category with this name already exists",
      "DUPLICATE_EXPENSE_CATEGORY",
    );
  }

  try {
    const category = await prisma.expenseCategory.create({
      data: {
        businessId,
        name: input.name,
        description: input.description ?? null,
      },
    });

    return toExpenseCategorySummary(category);
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function listExpenseCategories(
  businessId: string,
  query: ListExpenseCategoriesQuery,
): Promise<ExpenseCategorySummary[]> {
  const categories = await prisma.expenseCategory.findMany({
    where: {
      businessId,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    },
    orderBy: [{ name: "asc" }],
  });

  return categories.map(toExpenseCategorySummary);
}

export async function updateExpenseCategory(
  businessId: string,
  categoryId: string,
  input: UpdateExpenseCategoryInput,
): Promise<ExpenseCategorySummary> {
  await assertExpenseCategoryInBusiness(businessId, categoryId);

  if (input.name !== undefined) {
    const duplicate = await findDuplicateCategoryName(
      businessId,
      input.name,
      categoryId,
    );

    if (duplicate) {
      throw new AppError(
        409,
        "An expense category with this name already exists",
        "DUPLICATE_EXPENSE_CATEGORY",
      );
    }
  }

  try {
    const category = await prisma.expenseCategory.update({
      where: { id: categoryId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description ?? null }
          : {}),
      },
    });

    return toExpenseCategorySummary(category);
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function archiveExpenseCategory(
  businessId: string,
  categoryId: string,
): Promise<ExpenseCategorySummary> {
  await assertExpenseCategoryInBusiness(businessId, categoryId);

  const category = await prisma.expenseCategory.update({
    where: { id: categoryId },
    data: { isActive: false },
  });

  return toExpenseCategorySummary(category);
}

export async function restoreExpenseCategory(
  businessId: string,
  categoryId: string,
): Promise<ExpenseCategorySummary> {
  await assertExpenseCategoryInBusiness(businessId, categoryId);

  const category = await prisma.expenseCategory.update({
    where: { id: categoryId },
    data: { isActive: true },
  });

  return toExpenseCategorySummary(category);
}
