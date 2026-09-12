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

export const paymentProviders = ["MOCK", "ORANGE_MONEY", "AFRIMONEY"] as const;

export const paymentStatuses = [
  "CREATED",
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
] as const;

export const initiatePaymentSaleSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid("Product ID must be a valid UUID"),
            quantity: quantityStringSchema,
          })
          .strict(),
      )
      .min(1, "At least one item is required")
      .max(MAX_SALE_ITEMS, `A sale cannot exceed ${MAX_SALE_ITEMS} items`),
    discountAmount: moneyStringSchema.optional().default("0"),
    customerId: z.string().uuid("Customer ID must be a valid UUID").optional(),
    walletAmount: moneyStringSchema.optional().default("0"),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .strict();

export const initiatePaymentSchema = z
  .object({
    provider: z.enum(["MOCK", "ORANGE_MONEY"], {
      message: "Provider must be MOCK or ORANGE_MONEY",
    }),
    phoneNumber: z
      .string()
      .trim()
      .min(7, "Phone number is required")
      .max(20, "Phone number is too long")
      .optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
    sale: initiatePaymentSaleSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.provider === "ORANGE_MONEY" && !value.phoneNumber) {
      ctx.addIssue({
        code: "custom",
        message: "Phone number is required for Orange Money",
        path: ["phoneNumber"],
      });
    }
  });

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(paymentStatuses).optional(),
  provider: z.enum(paymentProviders).optional(),
  from: z
    .string()
    .datetime({ message: "from must be a valid ISO datetime" })
    .optional(),
  to: z
    .string()
    .datetime({ message: "to must be a valid ISO datetime" })
    .optional(),
});

export const paymentsReportQuerySchema = z.object({
  from: z
    .string()
    .datetime({ message: "from must be a valid ISO datetime" })
    .optional(),
  to: z
    .string()
    .datetime({ message: "to must be a valid ISO datetime" })
    .optional(),
});

export const orangeMoneyCallbackSchema = z
  .object({
    status: z.string().optional(),
    notif_token: z.string().optional(),
    notifToken: z.string().optional(),
    txnid: z.string().optional(),
    txnId: z.string().optional(),
  })
  .passthrough();

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type PaymentsReportQuery = z.infer<typeof paymentsReportQuerySchema>;
export type OrangeMoneyCallbackInput = z.infer<typeof orangeMoneyCallbackSchema>;
