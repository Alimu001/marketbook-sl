import { z } from "zod";
import { isValidQuantityInput } from "@/inventory/quantity";

const quantityField = z
  .string()
  .trim()
  .min(1, "Quantity is required")
  .refine(isValidQuantityInput, "Enter a valid non-negative quantity");

const positiveQuantityField = quantityField.refine(
  (value) => Number(value) > 0,
  "Quantity must be greater than zero",
);

export const openingStockFormSchema = z.object({
  quantity: quantityField,
  lowStockThreshold: quantityField.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const stockAdjustmentFormSchema = z.object({
  type: z.enum([
    "STOCK_IN",
    "STOCK_OUT",
    "ADJUSTMENT_IN",
    "ADJUSTMENT_OUT",
    "DAMAGE",
    "RETURN_IN",
  ]),
  quantity: positiveQuantityField,
  reason: z.string().trim().min(1, "Reason is required").max(200),
  notes: z.string().trim().max(500).optional(),
});

export const thresholdFormSchema = z.object({
  lowStockThreshold: quantityField,
});
