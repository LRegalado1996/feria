import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

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

/** Signs up a new user through Better Auth and registers it for cleanup. */
async function signUp({ email = uniqueEmail(), name = "Auth Test User" } = {}) {
  const result = await auth.api.signUpEmail({
    body: { email, name, password: PASSWORD },
  });
  createdUserIds.push(result.user.id);

  return { ...result, email };
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
  test("stores the user as given and returns it", async () => {
    const { email, user: created } = await signUp({ name: "Ada" });

    expect(created).toMatchObject({ email, name: "Ada" });
    expect(
      await db.query.user.findFirst({ where: eq(user.id, created.id) })
    ).toMatchObject({ id: created.id, email, name: "Ada" });
  });

  test("stores a credential account whose password is a salted hash", async () => {
    const first = await signUp();
    const second = await signUp();

    const firstCredential = await credentialOf(first.user.id);
    const secondCredential = await credentialOf(second.user.id);

    expect(firstCredential).toMatchObject({
      providerId: "credential",
      accountId: first.user.id,
    });
    expect(firstCredential?.password).not.toContain(PASSWORD);
    // The same password, hashed twice: a salt makes the hashes differ.
    expect(firstCredential?.password).not.toBe(secondCredential?.password);
  });

  test("signs the new user in with a session that lasts the default lifetime", async () => {
    vi.setSystemTime(NOW);
    const { token, user: created } = await signUp();

    expect(
      await db.query.session.findMany({ where: eq(session.userId, created.id) })
    ).toEqual([
      expect.objectContaining({
        token,
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + SESSION_LIFETIME_MS),
      }),
    ]);
  });

  test("refuses an email that is already registered", async () => {
    const { email } = await signUp();

    await expect(signUp({ email, name: "Someone Else" })).rejects.toThrow(
      "User already exists. Use another email."
    );
  });
});

describe("sign-in", () => {
  test("signs in the same user with a session of its own", async () => {
    const { email, token: signUpToken, user: created } = await signUp();

    const signedIn = await signIn(email);

    expect(signedIn.user.id).toBe(created.id);
    expect(signedIn.token).not.toBe(signUpToken);
    expect(await sessionTokensOf(created.id)).toEqual(
      new Set([signUpToken, signedIn.token])
    );
  });

  test("refuses a wrong password", async () => {
    const { email } = await signUp();

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
