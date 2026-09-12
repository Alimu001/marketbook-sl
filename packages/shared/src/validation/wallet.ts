import { z } from "zod";

const MAX_REASON_LENGTH = 500;
const MAX_NOTES_LENGTH = 2000;

const positiveMoneyStringSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .regex(/^\d+(\.\d{1,4})?$/, "Amount must be a valid positive decimal")
  .refine((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  }, "Amount must be greater than zero");

export const walletTransactionTypes = [
  "REFUND_CREDIT",
  "SALE_PAYMENT",
  "MANUAL_CREDIT",
  "MANUAL_DEBIT",
] as const;

export const refundDestinations = [
  "CASH",
  "MOBILE_MONEY",
  "BANK_TRANSFER",
  "WALLET",
] as const;

export const manualWalletCreditSchema = z
  .object({
    amount: positiveMoneyStringSchema,
    reason: z.string().trim().min(1).max(MAX_REASON_LENGTH),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .strict();

export const manualWalletDebitSchema = z
  .object({
    amount: positiveMoneyStringSchema,
    reason: z.string().trim().min(1).max(MAX_REASON_LENGTH),
    notes: z.string().trim().max(MAX_NOTES_LENGTH).optional(),
  })
  .strict();

export const walletHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(walletTransactionTypes).optional(),
  })
  .strict();

export const listBusinessWalletsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(150).optional(),
    positiveOnly: z
      .enum(["true", "false"])
      .optional()
      .default("true"),
  })
  .strict()
  .transform((value) => ({
    ...value,
    positiveOnly: value.positiveOnly === "true",
  }));

export type ManualWalletCreditInput = z.infer<typeof manualWalletCreditSchema>;
export type ManualWalletDebitInput = z.infer<typeof manualWalletDebitSchema>;
export type WalletHistoryQuery = z.infer<typeof walletHistoryQuerySchema>;
export type ListBusinessWalletsQuery = z.infer<typeof listBusinessWalletsQuerySchema>;
