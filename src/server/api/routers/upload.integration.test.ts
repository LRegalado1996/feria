import { randomUUID } from "node:crypto";

import { call } from "@orpc/server";
import { getPayloadFromClientToken } from "@vercel/blob/client";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createORPCContext } from "@/server/api/orpc";
import { createAccount } from "@/server/better-auth/accounts";
import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

import { uploadRouter } from "./upload";

// A token of the right shape: signing happens in this process, so no test
// reaches the real store.
vi.mock("@/env", () => ({
  env: {
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_Integration_s3cretPart",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The logins this file created; deleting one deletes its sessions.
const createdUserIds: string[] = [];

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, createdUserIds.splice(0)));
});

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    contentType: "image/jpeg",
    purpose: "cover",
    size: 2_000_000,
    ...overrides,
  };
}

/**
 * The request's context as `/api/orpc` builds it from the browser's
 * cookies: a fresh login's, signed in for real, or nobody's.
 */
async function setup({ signedIn = true }: { signedIn?: boolean } = {}) {
  let cookie = "";
  let userId: string | null = null;

  if (signedIn) {
    const email = `upload-${randomUUID()}@example.test`;
    const password = "synthetic-pass-123";
    const account = await createAccount(auth, db, {
      email,
      name: "Upload Test",
      password,
    });
    createdUserIds.push(account.id);
    userId = account.id;
    const { headers } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    cookie = headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(";")[0])
      .join("; ");
  }

  const context = await createORPCContext({ headers: new Headers({ cookie }) });

  return {
    createToken: async (input: unknown) =>
      await call(uploadRouter.createToken, input as never, { context }),
    removeLogin: async () => {
      if (userId) {
        await db.delete(user).where(eq(user.id, userId));
      }
    },
  };
}

describe("upload.createToken against the database", () => {
  test("an anonymous request is refused", async () => {
    const { createToken } = await setup({ signedIn: false });

    await expect(createToken(makeRequest())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  });

  test("an admin gets a token for that one file, in the local folder", async () => {
    vi.setSystemTime(new Date("2026-11-16T12:00:00.000Z"));
    const { createToken } = await setup();

    const { pathname, token } = await createToken(makeRequest());

    expect(pathname).toMatch(
      /^local\/cover\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/
    );
    expect(getPayloadFromClientToken(token)).toEqual({
      addRandomSuffix: false,
      allowOverwrite: false,
      allowedContentTypes: ["image/jpeg"],
      maximumSizeInBytes: 2_000_000,
      pathname,
      validUntil: new Date("2026-11-16T12:10:00.000Z").getTime(),
    });
  });

  test("a login removed after signing in is refused, though its session cookie lives on", async () => {
    const { createToken, removeLogin } = await setup();
    await removeLogin();

    await expect(createToken(makeRequest())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  });

  test.each([
    ["a type outside JPEG, PNG and WebP", { contentType: "image/svg+xml" }],
    ["a file one byte over the cover's cap", { size: 5_000_001 }],
  ])("%s is refused", async (_case, overrides) => {
    const { createToken } = await setup();

    await expect(createToken(makeRequest(overrides))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
  });

  test("a file exactly at the cap is allowed", async () => {
    const { createToken } = await setup();

    const { token } = await createToken(makeRequest({ size: 5_000_000 }));

    expect(getPayloadFromClientToken(token).maximumSizeInBytes).toBe(5_000_000);
  });
});
