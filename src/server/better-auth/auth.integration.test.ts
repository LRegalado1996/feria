import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { UserRole } from "@/lib/schemas/access";
import { createAccount } from "@/server/better-auth/accounts";
import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { account, session, user } from "@/server/db/schema";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const PASSWORD = "synthetic-pass-123";
const NOW = new Date("2030-01-01T00:00:00.000Z");
// Better Auth's default session lifetime: 7 days.
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// The users this file signed up. Deleting one cascades to its sessions and
// accounts, so this is the whole cleanup.
const createdUserIds: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await db.delete(user).where(inArray(user.id, createdUserIds.splice(0)));
});

/** A fresh email no other test or file uses. */
function uniqueEmail() {
  return `auth-${randomUUID()}@example.test`;
}

/**
 * Creates a login the way the app does now that sign-up is closed (FER-009),
 * and registers it for cleanup.
 */
async function createLogin({
  email = uniqueEmail(),
  name = "Auth Test User",
  role = "member",
}: { email?: string; name?: string; role?: UserRole } = {}) {
  const created = await createAccount(auth, db, {
    email,
    name,
    password: PASSWORD,
    role,
  });
  createdUserIds.push(created.id);

  return created;
}

async function signIn(email: string, password = PASSWORD) {
  return await auth.api.signInEmail({ body: { email, password } });
}

async function sessionTokensOf(userId: string) {
  const rows = await db.query.session.findMany({
    where: eq(session.userId, userId),
  });
  return new Set(rows.map(({ token }) => token));
}

async function credentialOf(userId: string) {
  return await db.query.account.findFirst({
    where: eq(account.userId, userId),
  });
}

describe("sign-up", () => {
  test("is closed: Better Auth refuses it even from the server, creating nobody", async () => {
    const email = uniqueEmail();

    await expect(
      auth.api.signUpEmail({
        body: { email, name: "Visitor", password: PASSWORD },
      })
    ).rejects.toMatchObject({
      body: {
        code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
        message: "Email and password sign up is not enabled",
      },
      statusCode: 400,
    });
    expect(
      await db.query.user.findFirst({ where: eq(user.email, email) })
    ).toBeUndefined();
  });
});

describe("createAccount", () => {
  test("stores the user as given, with its role, and returns it", async () => {
    const created = await createLogin({ name: "Ada", role: "superadmin" });

    expect(
      await db.query.user.findFirst({ where: eq(user.id, created.id) })
    ).toMatchObject({
      email: created.email,
      id: created.id,
      name: "Ada",
      role: "superadmin",
    });
  });

  test("a user stored without a role is a member, by the database's default", async () => {
    const id = `role-default-${randomUUID()}`;
    await db
      .insert(user)
      .values({ email: uniqueEmail(), id, name: "No Role Given" });
    createdUserIds.push(id);

    expect(
      await db.query.user.findFirst({
        columns: { role: true },
        where: eq(user.id, id),
      })
    ).toEqual({ role: "member" });
  });

  test("stores a credential account whose password is a salted hash", async () => {
    const first = await createLogin();
    const second = await createLogin();

    const firstCredential = await credentialOf(first.id);
    const secondCredential = await credentialOf(second.id);

    expect(firstCredential).toMatchObject({
      providerId: "credential",
      accountId: first.id,
    });
    expect(firstCredential?.password).not.toContain(PASSWORD);
    // The same password, hashed twice: a salt makes the hashes differ.
    expect(firstCredential?.password).not.toBe(secondCredential?.password);
  });

  test("opens no session: the person signs in themselves", async () => {
    const created = await createLogin();

    expect(await sessionTokensOf(created.id)).toEqual(new Set());
  });

  test("refuses an email that already has a login", async () => {
    const { email } = await createLogin();

    await expect(createLogin({ email })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "An account with that email already exists",
    });
  });
});

describe("sign-in", () => {
  test("signs a created login in with a session that lasts the default lifetime", async () => {
    vi.setSystemTime(NOW);
    const { email, id } = await createLogin();

    const signedIn = await signIn(email);

    expect(signedIn.user.id).toBe(id);
    expect(
      await db.query.session.findMany({ where: eq(session.userId, id) })
    ).toEqual([
      expect.objectContaining({
        token: signedIn.token,
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + SESSION_LIFETIME_MS),
      }),
    ]);
  });

  test("puts the role on the session, where pages route by it", async () => {
    const { email } = await createLogin({ role: "superadmin" });

    const signedIn = await signIn(email);

    expect(signedIn.user).toMatchObject({ role: "superadmin" });
  });

  test("refuses a wrong password", async () => {
    const { email } = await createLogin();

    await expect(signIn(email, "wrong-password-456")).rejects.toThrow(
      "Invalid email or password"
    );
  });

  test("refuses an unknown email with the same answer", async () => {
    await expect(signIn(uniqueEmail())).rejects.toThrow(
      "Invalid email or password"
    );
  });
});
