import { ORPCError } from "@orpc/server";

import {
  type CreateAccountValues,
  createAccountSchema,
} from "@/lib/schemas/access";

import type { auth as appAuth } from "./config";

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
  const { email, name, password, role } = createAccountSchema.parse(values);
  const context = await auth.$context;

  if (await context.internalAdapter.findUserByEmail(email)) {
    throw new ORPCError("CONFLICT", {
      message: "An account with that email already exists",
    });
  }

  const hash = await context.password.hash(password);
  const user = await context.internalAdapter.createUser(
    { email, emailVerified: false, name, role },
    { method: "admin" }
  );

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
