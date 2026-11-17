import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { uploadRouter } from "./upload";

// The router is session → limits → the login re-read → one service call.
// The token itself is `src/server/services/upload.test.ts`'s, and the same
// rules against a real database `upload.integration.test.ts`'s.

const BLOB_STORE = {
  host: "store9.public.blob.vercel-storage.com",
  namespace: "qa",
  token: "vercel_blob_rw_Store9_s3cretPart",
};

const services = vi.hoisted(() => ({
  findAdminStore: vi.fn(),
  issueUploadToken: vi.fn(async () => ({
    pathname: "qa/cover/0f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp",
    token: "vercel_blob_client_Store9_signed",
  })),
  requireBlobStore: vi.fn(),
}));

vi.mock("@/server/services/upload", () => ({
  issueUploadToken: services.issueUploadToken,
}));
vi.mock("@/server/services/access", () => ({
  findAdminStore: services.findAdminStore,
}));
vi.mock("@/server/api/utils/blob-store", () => ({
  requireBlobStore: services.requireBlobStore,
}));
vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    contentType: "image/webp",
    purpose: "cover",
    size: 1_200_000,
    ...overrides,
  };
}

/** An admin (or a login the database no longer has, or nobody) asking. */
function setup({
  isLogin = true,
  signedIn = true,
}: { isLogin?: boolean; signedIn?: boolean } = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  services.findAdminStore.mockResolvedValue(isLogin ? { id: 7 } : null);
  services.requireBlobStore.mockReturnValue(BLOB_STORE);

  return {
    db: mockCtx.db,
    createToken: async (input: unknown) =>
      await call(uploadRouter.createToken, input as never, {
        context: mockCtx as never,
      }),
  };
}

describe("upload.createToken", () => {
  test("gives an admin a token for the declared file in this deployment's store", async () => {
    const { createToken, db } = setup();

    await expect(createToken(makeRequest())).resolves.toEqual({
      pathname: "qa/cover/0f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp",
      token: "vercel_blob_client_Store9_signed",
    });

    expect(services.findAdminStore).toHaveBeenCalledExactlyOnceWith(
      db,
      "test-user-id"
    );
    expect(services.issueUploadToken).toHaveBeenCalledExactlyOnceWith(
      BLOB_STORE,
      makeRequest()
    );
  });

  test("refuses a signed-out caller before reading anything, whatever it asks", async () => {
    const { createToken } = setup({ signedIn: false });

    await expect(
      createToken(makeRequest({ size: 99_000_000 }))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Unauthorized" });

    expect(services.findAdminStore).not.toHaveBeenCalled();
    expect(services.issueUploadToken).not.toHaveBeenCalled();
  });

  test("refuses a session whose login is gone", async () => {
    const { createToken } = setup({ isLogin: false });

    await expect(createToken(makeRequest())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });

    expect(services.issueUploadToken).not.toHaveBeenCalled();
  });

  test.each([
    ["a type outside the three", { contentType: "image/gif" }],
    ["a file over the purpose's cap", { size: 5_000_001 }],
    ["an unknown purpose", { purpose: "avatar" }],
  ])("refuses %s before reading the login", async (_case, overrides) => {
    const { createToken } = setup();

    await expect(createToken(makeRequest(overrides))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });

    expect(services.findAdminStore).not.toHaveBeenCalled();
    expect(services.issueUploadToken).not.toHaveBeenCalled();
  });
});
