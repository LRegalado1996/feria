import { describe, expect, test, vi } from "vitest";

import { discardBlobs, readBlobStore, requireBlobStore } from "./blob-store";

const mocks = vi.hoisted(() => ({
  deleteBlobs: vi.fn(
    async (_db: unknown, _store: unknown, urls: readonly string[]) => [...urls]
  ),
  env: { BLOB_READ_WRITE_TOKEN: undefined as string | undefined },
  keepAlivePastResponse: vi.fn(
    (_work: Promise<unknown>, _options: { action: string }) => undefined
  ),
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/server/services/upload", () => ({
  deleteBlobs: mocks.deleteBlobs,
}));
vi.mock("@/server/api/utils/keep-alive-past-response", () => ({
  keepAlivePastResponse: mocks.keepAlivePastResponse,
}));

const TOKEN = "vercel_blob_rw_Store9_s3cretPart";
const STORE = {
  host: "store9.public.blob.vercel-storage.com",
  namespace: "qa",
  token: TOKEN,
};
const DB = { handle: "the app database" };
const URL_A = `https://${STORE.host}/qa/cover/a.webp`;

function setup({ token }: { token?: string } = {}) {
  mocks.env.BLOB_READ_WRITE_TOKEN = token;
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "qa");
}

describe("readBlobStore", () => {
  test("is the token's store, in the deployment's folder", () => {
    expect(readBlobStore(TOKEN, { VERCEL_TARGET_ENV: "production" })).toEqual({
      ...STORE,
      namespace: "production",
    });
  });

  test.each([
    ["no token", undefined],
    ["a token of another shape", "not-a-token"],
  ])("is null with %s", (_case, token) => {
    expect(readBlobStore(token, {})).toBeNull();
  });

  test("reads the validated environment by default", () => {
    setup({ token: TOKEN });

    expect(readBlobStore()).toEqual(STORE);
  });
});

describe("requireBlobStore", () => {
  test("answers the store when the token is set", () => {
    setup({ token: TOKEN });

    expect(requireBlobStore()).toEqual(STORE);
  });

  test("throws a plain error, a 500, without one", () => {
    setup();

    expect(() => requireBlobStore()).toThrow(
      new Error("BLOB_READ_WRITE_TOKEN is missing or malformed")
    );
  });
});

describe("discardBlobs", () => {
  test("deletes the addresses after the response, under its action", async () => {
    setup({ token: TOKEN });

    discardBlobs(DB as never, [URL_A]);

    expect(mocks.deleteBlobs).toHaveBeenCalledExactlyOnceWith(DB, STORE, [
      URL_A,
    ]);
    expect(mocks.keepAlivePastResponse).toHaveBeenCalledExactlyOnceWith(
      expect.any(Promise),
      { action: "Upload.discard_blobs" }
    );
    await expect(
      mocks.keepAlivePastResponse.mock.calls[0]?.[0]
    ).resolves.toEqual([URL_A]);
  });

  test.each([
    ["no store is configured", undefined, [URL_A]],
    ["there is nothing to delete", TOKEN, []],
  ])("does nothing when %s", (_case, token, urls) => {
    setup({ token });

    discardBlobs(DB as never, urls);

    expect(mocks.deleteBlobs).not.toHaveBeenCalled();
    expect(mocks.keepAlivePastResponse).not.toHaveBeenCalled();
  });
});
