import { z } from "zod";
import { BUSINESS_ROLES } from "../constants/roles.js";

const assignableRoles = ["admin", "staff", "cashier"] as const;

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(150),
  phone: z.string().trim().min(1, "Business phone is required").max(30).optional(),
  address: z.string().trim().min(1, "Business address is required").max(300).optional(),
});

const optionalProfileText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

export const updateBusinessSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Business name is required")
      .max(150)
      .optional(),
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    phone: optionalProfileText(30),
    address: optionalProfileText(300),
    receiptFooter: optionalProfileText(200),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one business field is required",
  });

export const updateMemberRoleSchema = z.object({
  role: z.enum(assignableRoles, {
    message: `Role must be one of: ${assignableRoles.join(", ")}`,
  }),
});

export const businessRoleSchema = z.enum(BUSINESS_ROLES);

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
