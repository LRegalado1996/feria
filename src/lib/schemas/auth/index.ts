import { z } from "zod";

import type { Dictionary } from "@/content";

/** The messages a visitor reads under a field, in the page's language. */
type AuthValidationMessages = Dictionary["auth"]["validation"];

/**
 * Built per language instead of exported once: the messages are shown under
 * the form's fields, so they come from the dictionary of the page.
 */
export function createAuthSchema(messages: AuthValidationMessages) {
  return z.object({
    name: z.string().optional(),
    email: z.email(messages.emailInvalid),
    password: z.string().min(8, messages.passwordTooShort),
  });
}

export type AuthFormValues = z.infer<ReturnType<typeof createAuthSchema>>;

export function createSignUpSchema(messages: AuthValidationMessages) {
  return createAuthSchema(messages).refine(
    (data) => data.name && data.name.length >= 2,
    {
      message: messages.nameTooShort,
      path: ["name"],
    }
  );
}
