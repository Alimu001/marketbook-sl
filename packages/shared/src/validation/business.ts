import { z } from "zod";
import { BUSINESS_ROLES } from "../constants/roles.js";

const assignableRoles = ["admin", "staff", "cashier"] as const;

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(150),
});

export const updateBusinessSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(150),
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
