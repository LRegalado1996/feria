import { z } from "zod";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/schemas/access";
import {
  type AccountAuth,
  type CreatedAccount,
  createAccount,
} from "@/server/better-auth/accounts";
import type { DatabaseClient } from "@/server/db";
import { hasSuperadmin } from "@/server/services/access";

/**
 * What the script reads from the environment. The password is never printed
 * or logged: a mistake in it is reported by its rule, not its value.
 */
const superadminEnvSchema = z.object({
  SUPERADMIN_EMAIL: z.email("SUPERADMIN_EMAIL must be an email address"),
  SUPERADMIN_NAME: z
    .string()
    .trim()
    .min(1)
    .max(120, "SUPERADMIN_NAME must be at most 120 characters")
    .default("Superadmin"),
  SUPERADMIN_PASSWORD: z
    .string(`SUPERADMIN_PASSWORD is required`)
    .min(
      PASSWORD_MIN_LENGTH,
      `SUPERADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`
    )
    .max(
      PASSWORD_MAX_LENGTH,
      `SUPERADMIN_PASSWORD must be at most ${PASSWORD_MAX_LENGTH} characters`
    ),
});

interface CreateSuperadminOptions {
  auth: AccountAuth;
  db: DatabaseClient;
  env: Record<string, string | undefined>;
}

/**
 * The first login of a fresh database (FER-009): sign-up is closed, so the
 * first superadmin cannot be created any other way. Refused once any
 * superadmin exists, so running it again, or against the wrong database,
 * never adds a second one or touches the first. Every later login is created
 * by a superadmin or a store member.
 */
export async function createSuperadmin({
  auth,
  db,
  env,
}: CreateSuperadminOptions): Promise<CreatedAccount> {
  const parsed = superadminEnvSchema.safeParse(env);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((issue) => issue.message).join("; ")
    );
  }

  if (await hasSuperadmin(db)) {
    throw new Error(
      "A superadmin already exists: this script only creates the first one"
    );
  }

  return await createAccount(auth, {
    email: parsed.data.SUPERADMIN_EMAIL,
    name: parsed.data.SUPERADMIN_NAME,
    password: parsed.data.SUPERADMIN_PASSWORD,
    role: "superadmin",
  });
}
