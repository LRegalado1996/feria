import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import { isUniqueViolation } from "@/lib/errors/postgres";
import {
  type CreateAccountValues,
  createAccountSchema,
} from "@/lib/schemas/access";
import type { DatabaseClient } from "@/server/db";
import { account, user } from "@/server/db/schema";

import type { auth as appAuth } from "./config";

/** The part of Better Auth this needs: its hasher and id generator. */
export type AccountAuth = Pick<typeof appAuth, "$context">;

/** A created login, without anything secret. */
export interface CreatedAccount {
  email: string;
  id: string;
  name: string;
}

// The name Postgres gives `user.email`'s unique constraint (migration 0000).
const EMAIL_UNIQUE_CONSTRAINT = "user_email_unique";

function emailTaken() {
  return new ORPCError("CONFLICT", {
    message: "An account with that email already exists",
  });
}

/**
 * Creates a login with an email and password the way Better Auth's sign-up
 * would (its hasher and ids, a `credential` account), now that sign-up is
 * closed to visitors (FER-009). Every login is an admin (FER-038); nothing
 * here reads a request.
 *
 * The user and its credential are written in one transaction, on `db` (the
 * app's client or the caller's transaction): Better Auth's own adapter writes
 * them in two statements, and a failure between them would leave a login
 * nobody can sign in with and whose email is taken.
 */
export async function createAccount(
  auth: AccountAuth,
  db: DatabaseClient,
  values: CreateAccountValues
): Promise<CreatedAccount> {
  const parsed = createAccountSchema.safeParse(values);

  if (!parsed.success) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The account's email, name or password is not valid",
    });
  }

  const { email, name, password } = parsed.data;
  const context = await auth.$context;
  const hash = await context.password.hash(password);
  // `false` only when ids are left to the database, which this app never does.
  const userId = context.generateId({ model: "user" }) || randomUUID();
  const accountId = context.generateId({ model: "account" }) || randomUUID();

  return await db.transaction(async (tx) => {
    const existing = await tx.query.user.findFirst({
      columns: { id: true },
      where: eq(user.email, email),
    });

    if (existing) {
      throw emailTaken();
    }

    try {
      await tx
        .insert(user)
        .values({ email, emailVerified: false, id: userId, name });
    } catch (error) {
      // Another request created the same email between the check and here.
      if (isUniqueViolation(error, EMAIL_UNIQUE_CONSTRAINT)) {
        throw emailTaken();
      }

      throw error;
    }

    await tx.insert(account).values({
      accountId: userId,
      id: accountId,
      password: hash,
      providerId: "credential",
      userId,
    });

    return { email, id: userId, name };
  });
}
