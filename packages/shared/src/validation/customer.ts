import { z } from "zod";
import { paymentMethods } from "./sales.js";

const MAX_NAME_LENGTH = 150;
const MAX_PHONE_LENGTH = 32;
const MAX_EMAIL_LENGTH = 254;
const MAX_ADDRESS_LENGTH = 300;
const MAX_NOTES_LENGTH = 500;

const moneyStringSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .regex(/^\d+(\.\d{1,4})?$/, "Amount must be a valid non-negative decimal")
  .refine((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0;
  }, "Amount cannot be negative");

const positiveMoneyStringSchema = moneyStringSchema.refine(
  (value) => Number(value) > 0,
  "Amount must be greater than zero",
);

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

export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(MAX_NAME_LENGTH),
    phone: optionalNormalizedString(MAX_PHONE_LENGTH),
    email: optionalNormalizedString(MAX_EMAIL_LENGTH),
    address: optionalNormalizedString(MAX_ADDRESS_LENGTH),
    notes: optionalNormalizedString(MAX_NOTES_LENGTH),
  })
  .strict();

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(MAX_NAME_LENGTH).optional(),
    phone: optionalNormalizedString(MAX_PHONE_LENGTH),
    email: optionalNormalizedString(MAX_EMAIL_LENGTH),
    address: optionalNormalizedString(MAX_ADDRESS_LENGTH),
    notes: optionalNormalizedString(MAX_NOTES_LENGTH),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value === "true";
    }),
  hasDebt: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value === "true";
    }),
});

export const debtStatuses = ["OPEN", "PARTIALLY_PAID", "PAID"] as const;

export const listCustomerDebtsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(debtStatuses).optional(),
});

export const listBusinessDebtsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(debtStatuses).optional(),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  customerId: z.string().uuid().optional(),
});

export const recordDebtPaymentSchema = z
  .object({
    amount: positiveMoneyStringSchema,
    paymentMethod: z.enum(paymentMethods, {
      message: `Payment method must be one of: ${paymentMethods.join(", ")}`,
    }),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .strict();

export const listDebtPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type ListCustomerDebtsQuery = z.infer<typeof listCustomerDebtsQuerySchema>;
export type ListBusinessDebtsQuery = z.infer<typeof listBusinessDebtsQuerySchema>;
export type RecordDebtPaymentInput = z.infer<typeof recordDebtPaymentSchema>;
export type ListDebtPaymentsQuery = z.infer<typeof listDebtPaymentsQuerySchema>;
