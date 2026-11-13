import { z } from "zod";

export const authSchema = z.object({
  name: z.string().optional(),
  email: z.email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthFormValues = z.infer<typeof authSchema>;

export const signUpSchema = authSchema.refine(
  (data) => data.name && data.name.length >= 2,
  {
    message: "Name must be at least 2 characters",
    path: ["name"],
  }
);
