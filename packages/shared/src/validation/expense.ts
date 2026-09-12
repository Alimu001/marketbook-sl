import { z } from "zod";
import { paymentMethods } from "./sales.js";

const MAX_CATEGORY_NAME_LENGTH = 100;
const MAX_CATEGORY_DESCRIPTION_LENGTH = 300;
const MAX_VENDOR_LENGTH = 150;
const MAX_REFERENCE_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_NOTES_LENGTH = 500;

const expenseDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expense date must be YYYY-MM-DD")
  .refine((value) => {
    const parts = value.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Expense date is invalid");

const positiveMoneyStringSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .regex(/^\d+(\.\d{1,4})?$/, "Amount must be a valid decimal")
  .refine((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  }, "Amount must be greater than zero");

function optionalNormalizedString(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value.length === 0 ? undefined : value;
    });
}

export const createExpenseCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Category name is required")
      .max(MAX_CATEGORY_NAME_LENGTH),
    description: optionalNormalizedString(MAX_CATEGORY_DESCRIPTION_LENGTH),
  })
  .strict();

export const updateExpenseCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Category name is required")
      .max(MAX_CATEGORY_NAME_LENGTH)
      .optional(),
    description: optionalNormalizedString(MAX_CATEGORY_DESCRIPTION_LENGTH),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const listExpenseCategoriesQuerySchema = z.object({
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value === "true";
    }),
});

export const createExpenseSchema = z
  .object({
    categoryId: z.string().uuid("Category ID must be a valid UUID"),
    amount: positiveMoneyStringSchema,
    paymentMethod: z.enum(paymentMethods, {
      message: `Payment method must be one of: ${paymentMethods.join(", ")}`,
    }),
    expenseDate: expenseDateSchema,
    vendorOrPayee: optionalNormalizedString(MAX_VENDOR_LENGTH),
    referenceNumber: optionalNormalizedString(MAX_REFERENCE_LENGTH),
    description: z
      .string()
      .trim()
      .min(1, "Description is required")
      .max(MAX_DESCRIPTION_LENGTH),
    notes: optionalNormalizedString(MAX_NOTES_LENGTH),
  })
  .strict();

export const updateExpenseSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    amount: positiveMoneyStringSchema.optional(),
    paymentMethod: z.enum(paymentMethods).optional(),
    expenseDate: expenseDateSchema.optional(),
    vendorOrPayee: optionalNormalizedString(MAX_VENDOR_LENGTH),
    referenceNumber: optionalNormalizedString(MAX_REFERENCE_LENGTH),
    description: z
      .string()
      .trim()
      .min(1, "Description is required")
      .max(MAX_DESCRIPTION_LENGTH)
      .optional(),
    notes: optionalNormalizedString(MAX_NOTES_LENGTH),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const listExpensesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    categoryId: z.string().uuid().optional(),
    paymentMethod: z.enum(paymentMethods).optional(),
    from: expenseDateSchema.optional(),
    to: expenseDateSchema.optional(),
    search: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    isArchived: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => {
        if (value === undefined) {
          return undefined;
        }

        return value === "true";
      }),
    recordedByUserId: z.string().uuid().optional(),
  })
  .refine(
    (value) => {
      if (value.from && value.to) {
        return value.from <= value.to;
      }

      return true;
    },
    { message: "from date must be on or before to date", path: ["from"] },
  );

export type CreateExpenseCategoryInput = z.infer<
  typeof createExpenseCategorySchema
>;
export type UpdateExpenseCategoryInput = z.infer<
  typeof updateExpenseCategorySchema
>;
export type ListExpenseCategoriesQuery = z.infer<
  typeof listExpenseCategoriesQuerySchema
>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
