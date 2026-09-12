import { z } from "zod";

export const createBusinessFormSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(150),
  phone: z.string().trim().min(1, "Business phone is required").max(30),
  address: z.string().trim().min(1, "Business address is required").max(300),
});

export type CreateBusinessFormInput = z.infer<typeof createBusinessFormSchema>;

export const businessProfileFormSchema = z
  .object({
    name: z.string().trim().min(1, "Business name is required").max(150),
    email: z.string().trim().toLowerCase().email("Enter a valid business email").max(254),
    phone: z.string().trim().max(30, "Phone number is too long"),
    address: z.string().trim().max(300, "Address is too long"),
    receiptFooter: z.string().trim().max(200, "Receipt footer is too long"),
  })
  .refine(
    ({ phone, address, receiptFooter }) =>
      Boolean(phone || address || receiptFooter),
    { message: "Enter a phone, address, or receipt footer before saving." },
  );

export type BusinessProfileFormInput = z.infer<
  typeof businessProfileFormSchema
>;
