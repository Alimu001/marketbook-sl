import { z } from "zod";
import { paymentMethods } from "./sales.js";

const MAX_NAME_LENGTH = 150;
const MAX_PHONE_LENGTH = 32;
const MAX_EMAIL_LENGTH = 254;
const MAX_ADDRESS_LENGTH = 300;
const MAX_NOTES_LENGTH = 500;
const MAX_PURCHASE_ITEMS = 100;

const quantityStringSchema = z
  .string()
  .trim()
  .min(1, "Quantity is required")
  .regex(/^\d+(\.\d{1,4})?$/, "Quantity must be a valid non-negative decimal")
  .refine((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  }, "Quantity must be greater than zero");

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

export const createSupplierSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(MAX_NAME_LENGTH),
    phone: optionalNormalizedString(MAX_PHONE_LENGTH),
    email: optionalNormalizedString(MAX_EMAIL_LENGTH),
    address: optionalNormalizedString(MAX_ADDRESS_LENGTH),
    notes: optionalNormalizedString(MAX_NOTES_LENGTH),
  })
  .strict();

export const updateSupplierSchema = z
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

export const listSuppliersQuerySchema = z.object({
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
  hasPayable: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value === "true";
    }),
});

export const payableStatuses = ["OPEN", "PARTIALLY_PAID", "PAID"] as const;

export const purchasePaymentStatuses = [
  "PAID",
  "PARTIALLY_PAID",
  "UNPAID",
] as const;

export const createPurchaseItemSchema = z
  .object({
    productId: z.string().uuid("Product ID must be a valid UUID"),
    quantity: quantityStringSchema,
    unitCost: moneyStringSchema,
  })
  .strict();

export const createPurchaseSchema = z
  .object({
    supplierId: z.string().uuid("Supplier ID must be a valid UUID"),
    items: z
      .array(createPurchaseItemSchema)
      .min(1, "At least one item is required")
      .max(MAX_PURCHASE_ITEMS, `A purchase cannot exceed ${MAX_PURCHASE_ITEMS} items`),
    discountAmount: moneyStringSchema.optional().default("0"),
    amountPaid: moneyStringSchema.optional().default("0"),
    paymentMethod: z.enum(paymentMethods).optional(),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .strict();

export const listPurchasesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  supplierId: z.string().uuid().optional(),
  paymentStatus: z.enum(purchasePaymentStatuses).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const listSupplierPayablesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(payableStatuses).optional(),
});

export const listBusinessPayablesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(payableStatuses).optional(),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  supplierId: z.string().uuid().optional(),
});

export const recordSupplierPaymentSchema = z
  .object({
    amount: positiveMoneyStringSchema,
    paymentMethod: z.enum(paymentMethods, {
      message: `Payment method must be one of: ${paymentMethods.join(", ")}`,
    }),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .strict();

export const listSupplierPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type CreatePurchaseItemInput = z.infer<typeof createPurchaseItemSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
export type ListSupplierPayablesQuery = z.infer<
  typeof listSupplierPayablesQuerySchema
>;
export type ListBusinessPayablesQuery = z.infer<
  typeof listBusinessPayablesQuerySchema
>;
export type RecordSupplierPaymentInput = z.infer<
  typeof recordSupplierPaymentSchema
>;
export type ListSupplierPaymentsQuery = z.infer<
  typeof listSupplierPaymentsQuerySchema
>;
