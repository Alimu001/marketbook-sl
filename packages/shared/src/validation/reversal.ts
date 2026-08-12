import { z } from "zod";
import { paymentMethods } from "./sales.js";

const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, "Quantity must be a positive decimal")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero");

export const saleRefundItemInputSchema = z
  .object({
    saleItemId: z.string().uuid(),
    quantity: quantitySchema,
    restock: z.boolean(),
  })
  .strict();

export const createSaleRefundSchema = z
  .object({
    items: z
      .array(saleRefundItemInputSchema)
      .min(1, "At least one refund item is required")
      .max(50),
    reason: z.string().trim().min(1).max(500),
    notes: z.string().trim().max(2000).optional(),
    refundPaymentMethod: z.enum(paymentMethods).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, item] of value.items.entries()) {
      if (seen.has(item.saleItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate saleItemId in refund request",
          path: ["items", index, "saleItemId"],
        });
      }
      seen.add(item.saleItemId);
    }
  });

export const listRefundsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    saleId: z.string().uuid().optional(),
  })
  .strict();

export const saleVoidSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const purchaseVoidSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export type CreateSaleRefundInput = z.infer<typeof createSaleRefundSchema>;
export type ListRefundsQuery = z.infer<typeof listRefundsQuerySchema>;
export type SaleVoidInput = z.infer<typeof saleVoidSchema>;
export type PurchaseVoidInput = z.infer<typeof purchaseVoidSchema>;
