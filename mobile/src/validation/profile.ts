import { z } from "zod";

export const profileFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(255)
    .transform((value) => value.toLowerCase()),
});
