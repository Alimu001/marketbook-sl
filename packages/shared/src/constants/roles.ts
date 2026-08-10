export const BUSINESS_ROLES = ["owner", "admin", "staff", "cashier"] as const;

export type BusinessRole = (typeof BUSINESS_ROLES)[number];
