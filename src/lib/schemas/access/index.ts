import { z } from "zod";

/**
 * The values of `user.role`, the type the database holds. Nothing reads them
 * since FER-038: every login is an admin and reaches the whole admin.
 * FER-041 makes the type the single value `admin` once no deployed build
 * reads these two (docs/agents/database.md § Migrations). Shoppers have no
 * account.
 */
export const USER_ROLES = ["superadmin", "member"] as const;

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
