import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { session, user } from "@/server/db/schema";

import { createORPCContext } from ".";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The users this file signed up; deleting one cascades to its sessions.
const createdUserIds: string[] = [];

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, createdUserIds.splice(0)));
});

/**
 * Signs a fresh user up and returns the cookies the browser would now hold,
 * with a `Cookie` header builder for any subset of them.
 */
async function setup() {
  const email = `session-cache-${randomUUID()}@example.test`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, name: "Cache Test", password: "synthetic-pass-123" },
    returnHeaders: true,
  });
  createdUserIds.push(response.user.id);

  const cookies = new Map<string, string>();

  for (const setCookie of headers.getSetCookie()) {
    const [pair = ""] = setCookie.split(";");
    const separator = pair.indexOf("=");
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }

  const nameOf = (part: string) => {
    const name = [...cookies.keys()].find((key) => key.includes(part));

    if (!name) {
      throw new Error(`sign-up set no ${part} cookie`);
    }

    return name;
  };

  return {
    email,
    userId: response.user.id,
    tokenCookie: nameOf("session_token"),
    dataCookie: nameOf("session_data"),
    cookieHeader: (names: string[]) =>
      new Headers({
        cookie: names
          .map((name) => `${name}=${cookies.get(name) ?? ""}`)
          .join("; "),
      }),
  };
}

describe("session cookie cache", () => {
  test("a request without the cache cookie gets a fresh one forwarded", async () => {
    const { cookieHeader, dataCookie, email, tokenCookie } = await setup();
    const resHeaders = new Headers();

    const context = await createORPCContext({
      headers: cookieHeader([tokenCookie]),
      resHeaders,
    });

    expect(context.session?.user.email).toBe(email);
    expect(resHeaders.getSetCookie()).toContainEqual(
      expect.stringMatching(new RegExp(`^${dataCookie}=[^;]+;`))
    );
  });

  test("a revoked session passes on the cached cookie, never on a page read", async () => {
    const { cookieHeader, dataCookie, email, tokenCookie, userId } =
      await setup();
    const headers = cookieHeader([tokenCookie, dataCookie]);
    await db.delete(session).where(eq(session.userId, userId));

    const cached = await createORPCContext({ headers });
    const authoritative = await auth.api.getSession({
      headers,
      query: { disableCookieCache: true },
    });

    // The documented stale-privilege window: up to `cookieCache.maxAge`.
    expect(cached.session?.user.email).toBe(email);
    expect(authoritative).toBeNull();
  });
});
