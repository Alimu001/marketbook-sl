import { z } from "zod";

export const createBusinessFormSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(150),
});

export type CreateBusinessFormInput = z.infer<typeof createBusinessFormSchema>;
