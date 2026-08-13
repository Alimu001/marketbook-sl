import { z } from "zod";
import { paymentMethods } from "./sales.js";

const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/, "Quantity must be a positive decimal")
  .refine((value) => Number(value) > 0, "Quantity must be greater than zero");

export const supplierReturnItemInputSchema = z
  .object({
    purchaseItemId: z.string().uuid(),
    quantity: quantitySchema,
  })
  .strict();

export const createSupplierReturnSchema = z
  .object({
    items: z
      .array(supplierReturnItemInputSchema)
      .min(1, "At least one return item is required")
      .max(50),
    reason: z.string().trim().min(1).max(500),
    notes: z.string().trim().max(2000).optional(),
    refundPaymentMethod: z.enum(paymentMethods).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, item] of value.items.entries()) {
      if (seen.has(item.purchaseItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate purchaseItemId in return request",
          path: ["items", index, "purchaseItemId"],
        });
      }
      seen.add(item.purchaseItemId);
    }
  });

export const listSupplierReturnsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    purchaseId: z.string().uuid().optional(),
    supplierId: z.string().uuid().optional(),
  })
  .strict();

export type CreateSupplierReturnInput = z.infer<
  typeof createSupplierReturnSchema
>;
export type ListSupplierReturnsQuery = z.infer<
  typeof listSupplierReturnsQuerySchema
>;
