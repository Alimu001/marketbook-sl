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

export const addBusinessMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  role: z.enum(assignableRoles),
});

export const listBusinessActivitiesQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const resetMemberPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export const businessRoleSchema = z.enum(BUSINESS_ROLES);

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type AddBusinessMemberInput = z.infer<typeof addBusinessMemberSchema>;
export type ListBusinessActivitiesQuery = z.infer<
  typeof listBusinessActivitiesQuerySchema
>;
export type ResetMemberPasswordInput = z.infer<typeof resetMemberPasswordSchema>;
