import type {
  ExpenseDetail,
  ExpenseListItem,
} from "@marketbook/shared/types";
import type {
  CreateExpenseInput,
  ListExpensesQuery,
  UpdateExpenseInput,
} from "@marketbook/shared/validation";
import type { Expense, Prisma } from "../../../generated/prisma/client.js";
import {
  formatExpenseDateOutput,
  parseExpenseDateInput,
} from "../../lib/expenseDate.js";
import { executeIdempotentMutation } from "../../lib/clientMutation.js";
import {
  formatMoney,
  toMoneyDecimalFromString,
} from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import { assertExpenseCategoryInBusiness } from "./expense-category.service.js";

const expenseInclude = {
  category: {
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  },
  recordedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.ExpenseInclude;

type ExpenseWithRelations = Prisma.ExpenseGetPayload<{
  include: typeof expenseInclude;
}>;

function toExpenseListItem(
  expense: ExpenseWithRelations,
): ExpenseListItem {
  return {
    id: expense.id,
    amount: formatMoney(expense.amount),
    category: {
      id: expense.category.id,
      name: expense.category.name,
      isActive: expense.category.isActive,
    },
    paymentMethod: expense.paymentMethod,
    expenseDate: formatExpenseDateOutput(expense.expenseDate),
    vendorOrPayee: expense.vendorOrPayee,
    description: expense.description,
    isArchived: expense.isArchived,
    recordedBy: {
      id: expense.recordedBy.id,
      name: expense.recordedBy.name,
      email: expense.recordedBy.email,
    },
    createdAt: expense.createdAt.toISOString(),
  };
}

function toExpenseDetail(
  expense: ExpenseWithRelations,
): ExpenseDetail {
  return {
    id: expense.id,
    businessId: expense.businessId,
    amount: formatMoney(expense.amount),
    category: {
      id: expense.category.id,
      name: expense.category.name,
      isActive: expense.category.isActive,
    },
    paymentMethod: expense.paymentMethod,
    expenseDate: formatExpenseDateOutput(expense.expenseDate),
    vendorOrPayee: expense.vendorOrPayee,
    referenceNumber: expense.referenceNumber,
    description: expense.description,
    notes: expense.notes,
    isArchived: expense.isArchived,
    recordedBy: {
      id: expense.recordedBy.id,
      name: expense.recordedBy.name,
      email: expense.recordedBy.email,
    },
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

async function assertExpenseInBusiness(
  businessId: string,
  expenseId: string,
): Promise<Expense> {
  const expense = await prisma.expense.findFirst({
    where: {
      id: expenseId,
      businessId,
    },
  });

  if (!expense) {
    throw new AppError(
      404,
      "Expense not found",
      "EXPENSE_NOT_FOUND",
    );
  }

  return expense;
}

async function validateCategoryForExpense(
  businessId: string,
  categoryId: string,
): Promise<void> {
  await assertExpenseCategoryInBusiness(
    businessId,
    categoryId,
    {
      requireActive: true,
    },
  );
}

export async function createExpense(
  businessId: string,
  recordedByUserId: string,
  input: CreateExpenseInput,
  options: { mutationId?: string | undefined } = {},
): Promise<ExpenseDetail> {
  return executeIdempotentMutation({
    businessId,
    userId: recordedByUserId,
    mutationId: options.mutationId,
    entityType: "EXPENSE",
    payload: input,

    execute: async () => {
      await validateCategoryForExpense(
        businessId,
        input.categoryId,
      );

      const amount = toMoneyDecimalFromString(
        input.amount,
      );

      if (amount.lte(0)) {
        throw new AppError(
          400,
          "Amount must be greater than zero",
          "INVALID_EXPENSE_AMOUNT",
        );
      }

      const expenseDate = parseExpenseDateInput(
        input.expenseDate,
      );

      const expense = await prisma.expense.create({
        data: {
          businessId,
          categoryId: input.categoryId,
          recordedByUserId,
          amount,
          paymentMethod: input.paymentMethod,
          expenseDate,
          vendorOrPayee:
            input.vendorOrPayee ?? null,
          referenceNumber:
            input.referenceNumber ?? null,
          description: input.description,
          notes: input.notes ?? null,
        },
        include: expenseInclude,
      });

      const detail = toExpenseDetail(expense);

      return {
        entityId: expense.id,
        result: detail,
      };
    },

    loadExisting: (expenseId) =>
      getExpenseDetail(
        businessId,
        expenseId,
      ),
  });
}

export async function listExpenses(
  businessId: string,
  query: ListExpensesQuery,
) {
  const where: Prisma.ExpenseWhereInput = {
    businessId,

    ...(query.categoryId
      ? { categoryId: query.categoryId }
      : {}),

    ...(query.paymentMethod
      ? { paymentMethod: query.paymentMethod }
      : {}),

    ...(query.isArchived !== undefined
      ? { isArchived: query.isArchived }
      : {}),

    ...(query.recordedByUserId
      ? {
          recordedByUserId:
            query.recordedByUserId,
        }
      : {}),

    ...(query.from || query.to
      ? {
          expenseDate: {
            ...(query.from
              ? {
                  gte: parseExpenseDateInput(
                    query.from,
                  ),
                }
              : {}),
            ...(query.to
              ? {
                  lte: parseExpenseDateInput(
                    query.to,
                  ),
                }
              : {}),
          },
        }
      : {}),

    ...(query.search
      ? {
          OR: [
            {
              description: {
                contains: query.search,
                mode: "insensitive",
              },
            },
            {
              vendorOrPayee: {
                contains: query.search,
                mode: "insensitive",
              },
            },
            {
              referenceNumber: {
                contains: query.search,
                mode: "insensitive",
              },
            },
            {
              category: {
                name: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };

  const skip =
    (query.page - 1) * query.limit;

  const [total, expenses] =
    await prisma.$transaction([
      prisma.expense.count({
        where,
      }),

      prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [
          {
            expenseDate: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip,
        take: query.limit,
      }),
    ]);

  return {
    items: expenses.map(
      toExpenseListItem,
    ),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getExpenseDetail(
  businessId: string,
  expenseId: string,
): Promise<ExpenseDetail> {
  const expense =
    await prisma.expense.findFirst({
      where: {
        id: expenseId,
        businessId,
      },
      include: expenseInclude,
    });

  if (!expense) {
    throw new AppError(
      404,
      "Expense not found",
      "EXPENSE_NOT_FOUND",
    );
  }

  return toExpenseDetail(expense);
}

export async function updateExpense(
  businessId: string,
  expenseId: string,
  input: UpdateExpenseInput,
): Promise<ExpenseDetail> {
  await assertExpenseInBusiness(
    businessId,
    expenseId,
  );

  if (input.categoryId !== undefined) {
    await validateCategoryForExpense(
      businessId,
      input.categoryId,
    );
  }

  let amount:
    | Prisma.Decimal
    | undefined;

  if (input.amount !== undefined) {
    amount =
      toMoneyDecimalFromString(
        input.amount,
      );

    if (amount.lte(0)) {
      throw new AppError(
        400,
        "Amount must be greater than zero",
        "INVALID_EXPENSE_AMOUNT",
      );
    }
  }

  const expense =
    await prisma.expense.update({
      where: {
        id: expenseId,
      },

      data: {
        ...(input.categoryId !== undefined
          ? {
              categoryId:
                input.categoryId,
            }
          : {}),

        ...(amount !== undefined
          ? {
              amount,
            }
          : {}),

        ...(input.paymentMethod !== undefined
          ? {
              paymentMethod:
                input.paymentMethod,
            }
          : {}),

        ...(input.expenseDate !== undefined
          ? {
              expenseDate:
                parseExpenseDateInput(
                  input.expenseDate,
                ),
            }
          : {}),

        ...(input.vendorOrPayee !== undefined
          ? {
              vendorOrPayee:
                input.vendorOrPayee ??
                null,
            }
          : {}),

        ...(input.referenceNumber !== undefined
          ? {
              referenceNumber:
                input.referenceNumber ??
                null,
            }
          : {}),

        ...(input.description !== undefined
          ? {
              description:
                input.description,
            }
          : {}),

        ...(input.notes !== undefined
          ? {
              notes:
                input.notes ?? null,
            }
          : {}),
      },

      include: expenseInclude,
    });

  return toExpenseDetail(expense);
}

export async function archiveExpense(
  businessId: string,
  expenseId: string,
): Promise<ExpenseDetail> {
  await assertExpenseInBusiness(
    businessId,
    expenseId,
  );

  const expense =
    await prisma.expense.update({
      where: {
        id: expenseId,
      },

      data: {
        isArchived: true,
      },

      include: expenseInclude,
    });

  return toExpenseDetail(expense);
}

export async function restoreExpense(
  businessId: string,
  expenseId: string,
): Promise<ExpenseDetail> {
  await assertExpenseInBusiness(
    businessId,
    expenseId,
  );

  const expense =
    await prisma.expense.update({
      where: {
        id: expenseId,
      },

      data: {
        isArchived: false,
      },

      include: expenseInclude,
    });

  return toExpenseDetail(expense);
}