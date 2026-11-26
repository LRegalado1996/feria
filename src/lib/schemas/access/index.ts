import { z } from "zod";

import type { Dictionary } from "@/content";

/**
 * The values of `user.role`, the type the database holds. Every login is an
 * admin and reaches the whole admin (FER-038); `superadmin` marks the one
 * login no other may disable or reset (Lucas, 2026-11-25), `member` every
 * other. Shoppers have no account.
 */
export const USER_ROLES = ["superadmin", "member"] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Better Auth's own bounds, so a password it would refuse is a 400 here. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * A login created on the server (FER-009): by the first-run script, the seed,
 * or later the user screens (FER-015). Never from a visitor's own request.
 */
export const createAccountSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export type CreateAccountValues = z.infer<typeof createAccountSchema>;

/**
 * A login's id as Better Auth writes it. It comes from the client, so it is
 * attacker-controlled: bounded here and looked up by the service, never
 * trusted to name a login that exists.
 */
const loginIdSchema = z.string().trim().min(1).max(64);

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

/**
 * Whether two passwords are one to Better Auth, which hashes a password's
 * NFKC form: "ｐａｓｓ" and "pass" sign in alike, so a new password that only
 * differs from the current one that way changes nothing.
 */
function isSamePassword(a: string, b: string): boolean {
  return a.normalize("NFKC") === b.normalize("NFKC");
}

/** One login of the store, named by its id (FER-015). */
export const loginRefSchema = z.object({ id: loginIdSchema });

/** A new temporary password an admin typed for another login (FER-015). */
export const resetLoginPasswordSchema = z.object({
  id: loginIdSchema,
  password: passwordSchema,
});

/**
 * The signed-in login choosing its own password (FER-015). The new one must
 * differ from the current one: a temporary password kept as it was is no
 * change at all.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine(
    (values) => !isSamePassword(values.newPassword, values.currentPassword),
    {
      message: "The new password must differ from the current one",
      path: ["newPassword"],
    }
  );

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/**
 * Why a change to the logins was refused, as each procedure says it. Clients
 * compare an error's message with these to say it in their own words; the
 * message itself is never shown.
 */
export const LOGIN_REFUSALS = {
  /** `adminProcedure`: the signed-in login is still on a temporary password. */
  passwordChangeRequired: "Change the temporary password first",
  /** Disabling the one login still enabled would lock the store out. */
  lastEnabledLogin: "The last enabled login cannot be disabled",
  /**
   * The superadmin's login (Lucas, 2026-11-25): no other login disables,
   * enables or resets it.
   */
  protectedLogin: "The superadmin's login cannot be changed by another login",
  /** Nobody disables their own login. */
  ownLoginDisabled: "You cannot disable your own login",
  /** Nobody resets their own password: they change it, knowing the current one. */
  ownPasswordReset: "Change your own password instead of resetting it",
  /** Too many wrong current passwords: wait `data.retryAfter` seconds. */
  tooManyPasswordAttempts: "Too many wrong passwords: try again later",
  /** The current password typed to change it is not the login's. */
  wrongCurrentPassword: "The current password is not correct",
} as const;

/**
 * How many wrong current passwords a login may type before it waits
 * (docs/agents/security.md § Rate limits): changing the password is a
 * second door to guess it through, for whoever holds a session. The wait
 * runs from the last wrong try, so it never doubles across a window's edge.
 */
export const PASSWORD_ATTEMPTS = { max: 5, windowMs: 15 * 60 * 1000 } as const;

/**
 * The code a disabled login's sign-in answers with (FER-015), which the
 * sign-in form says in its own words. Better Auth sends it only after the
 * password matched: whoever reads it already knows the password.
 */
export const LOGIN_DISABLED_CODE = "LOGIN_DISABLED";

/** The messages an admin reads under the new login's fields. */
type LoginFormMessages = Dictionary["admin"]["users"]["validation"];

/**
 * The form that creates a login, built per language: its messages are shown
 * under its fields. The procedure validates with `createAccountSchema`.
 */
export function createLoginFormSchema(messages: LoginFormMessages) {
  return z.object({
    email: z.string().trim().pipe(z.email(messages.emailInvalid)),
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .max(120, messages.nameTooLong),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, messages.passwordTooShort)
      .max(PASSWORD_MAX_LENGTH, messages.passwordTooLong),
  });
}

export type LoginFormValues = z.infer<ReturnType<typeof createLoginFormSchema>>;

/** The form that sets another login's temporary password. */
export function createResetPasswordFormSchema(messages: LoginFormMessages) {
  return z.object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, messages.passwordTooShort)
      .max(PASSWORD_MAX_LENGTH, messages.passwordTooLong),
  });
}

export type ResetPasswordFormValues = z.infer<
  ReturnType<typeof createResetPasswordFormSchema>
>;

/** The messages a login reads under the change-password form's fields. */
type ChangePasswordMessages = Dictionary["admin"]["password"]["validation"];

/**
 * The change-password form: the new password typed twice, so a typo on a
 * phone's keyboard does not lock the login out.
 */
export function createChangePasswordFormSchema(
  messages: ChangePasswordMessages
) {
  return z
    .object({
      confirmPassword: z.string(),
      currentPassword: z
        .string()
        .min(1, messages.currentRequired)
        .max(PASSWORD_MAX_LENGTH, messages.passwordTooLong),
      newPassword: z
        .string()
        .min(PASSWORD_MIN_LENGTH, messages.passwordTooShort)
        .max(PASSWORD_MAX_LENGTH, messages.passwordTooLong),
    })
    .refine(
      (values) => !isSamePassword(values.newPassword, values.currentPassword),
      {
        message: messages.sameAsCurrent,
        path: ["newPassword"],
      }
    )
    .refine((values) => values.confirmPassword === values.newPassword, {
      message: messages.mismatch,
      path: ["confirmPassword"],
    });
}

export type ChangePasswordFormValues = z.infer<
  ReturnType<typeof createChangePasswordFormSchema>
>;
