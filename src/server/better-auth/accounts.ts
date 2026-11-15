import { ORPCError } from "@orpc/server";

import { isUniqueViolation } from "@/lib/errors/postgres";
import {
  type CreateAccountValues,
  createAccountSchema,
} from "@/lib/schemas/access";

import type { auth as appAuth } from "./config";

// The name Postgres gives `user.email`'s unique constraint (migration 0000).
const EMAIL_UNIQUE_CONSTRAINT = "user_email_unique";

function emailTaken() {
  return new ORPCError("CONFLICT", {
    message: "An account with that email already exists",
  });
}

/** The part of Better Auth this needs: its internal adapter and hasher. */
export type AccountAuth = Pick<typeof appAuth, "$context">;

/** A created login, without anything secret. */
export interface CreatedAccount {
  email: string;
  id: string;
  name: string;
  role: CreateAccountValues["role"];
}

/**
 * Creates a login with an email and password, the way Better Auth's sign-up
 * would (its hasher, its `credential` account), now that sign-up is closed to
 * visitors (FER-009). The role is the caller's to decide; nothing here reads a
 * request.
 *
 * Better Auth writes the user and the credential in two statements. If the
 * second fails, the user is deleted again, so no login exists without a way
 * to sign in.
 */
export async function createAccount(
  auth: AccountAuth,
  values: CreateAccountValues
): Promise<CreatedAccount> {
  const parsed = createAccountSchema.safeParse(values);

  if (!parsed.success) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The account's email, name, password or role is not valid",
    });
  }

  const { email, name, password, role } = parsed.data;
  const context = await auth.$context;

  if (await context.internalAdapter.findUserByEmail(email)) {
    throw emailTaken();
  }

  const hash = await context.password.hash(password);
  let user: Awaited<ReturnType<typeof context.internalAdapter.createUser>>;

  try {
    user = await context.internalAdapter.createUser(
      { email, emailVerified: false, name, role },
      { method: "admin" }
    );
  } catch (error) {
    // Another request created the same email between the check and here.
    if (isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT)) {
      throw emailTaken();
    }

    throw error;
  }

  try {
    await context.internalAdapter.linkAccount({
      accountId: user.id,
      password: hash,
      providerId: "credential",
      userId: user.id,
    });
  } catch (error) {
    await context.internalAdapter.deleteUser(user.id);
    throw error;
  }

  return { email: user.email, id: user.id, name: user.name, role };
}
