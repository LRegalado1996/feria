import { z } from "zod";

import { storeSlugSchema } from "@/lib/schemas/store";

/**
 * Who a login is (FER-009). A superadmin reaches every store and the platform
 * area; a member reaches only the stores they belong to, all with the same
 * permissions. Shoppers have no account.
 */
export const USER_ROLES = ["superadmin", "member"] as const;

export type UserRole = (typeof USER_ROLES)[number];

/**
 * The part of every store-scoped procedure's input that names the store. The
 * slug is attacker-controlled: `storeProcedure` resolves it against the
 * caller's memberships before the handler sees a store.
 */
export const storeScopeSchema = z.object({ storeSlug: storeSlugSchema });

export type StoreScopeValues = z.infer<typeof storeScopeSchema>;

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
  role: z.enum(USER_ROLES),
});

export type CreateAccountValues = z.infer<typeof createAccountSchema>;
