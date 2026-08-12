import { z } from "zod";

const MAX_NOTES_LENGTH = 500;
const MAX_SALE_ITEMS = 100;

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

export const paymentMethods = [
  "CASH",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
] as const;

export const createSaleItemSchema = z
  .object({
    productId: z.string().uuid("Product ID must be a valid UUID"),
    quantity: quantityStringSchema,
  })
  .strict();

export const salePaymentStatuses = ["PAID", "PARTIALLY_PAID", "UNPAID"] as const;

export const createSaleSchema = z
  .object({
    items: z
      .array(createSaleItemSchema)
      .min(1, "At least one item is required")
      .max(MAX_SALE_ITEMS, `A sale cannot exceed ${MAX_SALE_ITEMS} items`),
    discountAmount: moneyStringSchema.optional().default("0"),
    customerId: z.string().uuid("Customer ID must be a valid UUID").optional(),
    walletAmount: moneyStringSchema.optional().default("0"),
    amountPaid: moneyStringSchema.optional(),
    paymentMethod: z.enum(paymentMethods, {
      message: `Payment method must be one of: ${paymentMethods.join(", ")}`,
    }).optional(),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .strict();

export const listSalesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  paymentMethod: z.enum(paymentMethods).optional(),
  paymentStatus: z.enum(salePaymentStatuses).optional(),
  from: z
    .string()
    .datetime({ message: "from must be a valid ISO datetime" })
    .optional(),
  to: z
    .string()
    .datetime({ message: "to must be a valid ISO datetime" })
    .optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type CreateSaleItemInput = z.infer<typeof createSaleItemSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
