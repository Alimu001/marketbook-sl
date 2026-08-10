import { z } from "zod";

const MAX_NAME_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SKU_LENGTH = 64;
const MAX_BARCODE_LENGTH = 64;
const MAX_UNIT_LENGTH = 32;
const MAX_CATEGORY_LENGTH = 100;

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

export const moneySchema = z
  .number({
    message: "Price must be a valid number",
  })
  .finite("Price must be a finite number")
  .min(0, "Price cannot be negative");

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1, "Product name is required").max(MAX_NAME_LENGTH),
    description: optionalNormalizedString(MAX_DESCRIPTION_LENGTH),
    sku: optionalNormalizedString(MAX_SKU_LENGTH),
    barcode: optionalNormalizedString(MAX_BARCODE_LENGTH),
    category: optionalNormalizedString(MAX_CATEGORY_LENGTH),
    unit: z.string().trim().min(1, "Unit is required").max(MAX_UNIT_LENGTH),
    costPrice: moneySchema,
    sellingPrice: moneySchema,
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Product name is required")
      .max(MAX_NAME_LENGTH)
      .optional(),
    description: optionalNormalizedString(MAX_DESCRIPTION_LENGTH),
    sku: optionalNormalizedString(MAX_SKU_LENGTH),
    barcode: optionalNormalizedString(MAX_BARCODE_LENGTH),
    category: optionalNormalizedString(MAX_CATEGORY_LENGTH),
    unit: z.string().trim().min(1, "Unit is required").max(MAX_UNIT_LENGTH).optional(),
    costPrice: moneySchema.optional(),
    sellingPrice: moneySchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const listProductsQuerySchema = z.object({
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
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
