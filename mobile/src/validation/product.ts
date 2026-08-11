import { z } from "zod";
import { isValidMoneyInput, parseMoneyInput } from "@/products/money";

const MAX_NAME_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SKU_LENGTH = 64;
const MAX_BARCODE_LENGTH = 64;
const MAX_UNIT_LENGTH = 32;

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

const moneyInputSchema = z
  .string()
  .trim()
  .min(1, "Price is required")
  .refine(isValidMoneyInput, "Enter a valid non-negative price (e.g. 120 or 120.00)")
  .transform(parseMoneyInput)
  .refine((value) => Number.isFinite(value) && value >= 0, "Price cannot be negative");

export const createProductFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Product name is required")
    .max(MAX_NAME_LENGTH),
  description: optionalNormalizedString(MAX_DESCRIPTION_LENGTH),
  sku: optionalNormalizedString(MAX_SKU_LENGTH),
  barcode: optionalNormalizedString(MAX_BARCODE_LENGTH),
  unit: z.string().trim().min(1, "Unit is required").max(MAX_UNIT_LENGTH),
  costPrice: moneyInputSchema,
  sellingPrice: moneyInputSchema,
});

export const updateProductFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Product name is required")
    .max(MAX_NAME_LENGTH),
  description: optionalNormalizedString(MAX_DESCRIPTION_LENGTH),
  sku: optionalNormalizedString(MAX_SKU_LENGTH),
  barcode: optionalNormalizedString(MAX_BARCODE_LENGTH),
  unit: z.string().trim().min(1, "Unit is required").max(MAX_UNIT_LENGTH),
  costPrice: moneyInputSchema,
  sellingPrice: moneyInputSchema,
});

export type CreateProductFormInput = z.infer<typeof createProductFormSchema>;
export type UpdateProductFormInput = z.infer<typeof updateProductFormSchema>;

export const UNIT_SUGGESTIONS = [
  "piece",
  "bag",
  "carton",
  "box",
  "bottle",
  "kg",
  "litre",
] as const;
