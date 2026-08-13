import { z } from "zod";

const MAX_REASON_LENGTH = 200;
const MAX_NOTES_LENGTH = 500;

const quantityStringSchema = z
  .string()
  .trim()
  .min(1, "Quantity is required")
  .regex(/^\d+(\.\d{1,4})?$/, "Quantity must be a valid non-negative decimal")
  .refine((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0;
  }, "Quantity cannot be negative");

const positiveQuantityStringSchema = quantityStringSchema.refine(
  (value) => Number(value) > 0,
  "Quantity must be greater than zero",
);

export const openingStockSchema = z
  .object({
    quantity: quantityStringSchema,
    lowStockThreshold: quantityStringSchema.optional(),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .strict();

export const stockAdjustmentTypes = [
  "STOCK_IN",
  "STOCK_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "DAMAGE",
  "RETURN_IN",
] as const;

export const stockAdjustmentSchema = z
  .object({
    type: z.enum(stockAdjustmentTypes, {
      message: `Type must be one of: ${stockAdjustmentTypes.join(", ")}`,
    }),
    quantity: positiveQuantityStringSchema,
    reason: z
      .string()
      .trim()
      .min(1, "Reason is required")
      .max(MAX_REASON_LENGTH),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .strict();

export const updateLowStockThresholdSchema = z
  .object({
    lowStockThreshold: quantityStringSchema,
  })
  .strict();

export const listInventoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  lowStock: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value === "true";
    }),
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

export const inventoryHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type OpeningStockInput = z.infer<typeof openingStockSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type UpdateLowStockThresholdInput = z.infer<
  typeof updateLowStockThresholdSchema
>;
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type InventoryHistoryQuery = z.infer<typeof inventoryHistoryQuerySchema>;
