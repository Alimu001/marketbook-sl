import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address")
    .max(255)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Password is required").max(128),
});

export const registerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    email: z
      .string()
      .trim()
      .min(1, "Email is required")
      .email("Invalid email address")
      .max(255)
      .transform((value) => value.toLowerCase()),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type RegisterFormValues = z.infer<typeof registerFormSchema>;
