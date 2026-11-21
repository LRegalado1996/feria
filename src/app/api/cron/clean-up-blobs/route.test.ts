import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import type * as UploadService from "@/server/services/upload";

import { GET } from "./route";

const SECRET = "a-cron-secret-of-32-characters!!";
const BLOB_STORE = {
  host: "store9.public.blob.vercel-storage.com",
  namespace: "production",
  token: "vercel_blob_rw_Store9_s3cretPart",
};

const mocks = vi.hoisted(() => ({
  captureExceptionWithScope: vi.fn(
    (_error: unknown, _scope: unknown): string | null => "event-1"
  ),
  cleanUpOrphanBlobs: vi.fn(),
  env: { CRON_SECRET: undefined as string | undefined },
  readBlobStore: vi.fn(),
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/lib/sentry", () => ({
  captureExceptionWithScope: mocks.captureExceptionWithScope,
}));
vi.mock("@/server/api/utils/blob-store", () => ({
  readBlobStore: mocks.readBlobStore,
}));
// The age stays the real one: the test asserts the date it gives.
vi.mock("@/server/services/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof UploadService>()),
  cleanUpOrphanBlobs: mocks.cleanUpOrphanBlobs,
}));

/**
 * The route with a secret configured (or not), a Blob store (or not), and a
 * cleanup that deletes two of three files (or fails).
 */
function setup({
  cleanupFails = false,
  secret = SECRET,
  store = true,
}: {
  cleanupFails?: boolean;
  /** `null`: no secret configured. */
  secret?: string | null;
  store?: boolean;
} = {}) {
  mocks.env.CRON_SECRET = secret ?? undefined;
  mocks.readBlobStore.mockReturnValue(store ? BLOB_STORE : null);
  const failure = new Error("Blob API unreachable");

  if (cleanupFails) {
    mocks.cleanUpOrphanBlobs.mockRejectedValue(failure);
  } else {
    mocks.cleanUpOrphanBlobs.mockResolvedValue({
      checked: 3,
      deleted: ["production/cover/a.webp", "production/cover/b.webp"],
    });
  }

  return {
    failure,
    get: async (authorization?: string) => {
      const response = await GET(
        new NextRequest("http://localhost:3000/api/cron/clean-up-blobs", {
          headers: {
            ...(authorization === undefined ? {} : { authorization }),
            "x-request-id": "req-7",
          },
        })
      );

      return {
        body: (await response.json()) as unknown,
        cacheControl: response.headers.get("cache-control"),
        status: response.status,
      };
    },
  };
}

describe("cron: clean up blobs", () => {
  test("with the right secret, deletes the files older than two days and answers the counts", async () => {
    vi.setSystemTime(new Date("2026-11-17T07:00:00.000Z"));
    const { get } = setup();

    await expect(get(`Bearer ${SECRET}`)).resolves.toEqual({
      body: { checked: 3, deleted: 2 },
      cacheControl: "no-store",
      status: 200,
    });
    expect(mocks.cleanUpOrphanBlobs).toHaveBeenCalledExactlyOnceWith(
      db,
      BLOB_STORE,
      { olderThan: new Date("2026-11-15T07:00:00.000Z") }
    );
    expect(mocks.captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer not-the-cron-secret-at-all!!"],
    ["the secret without its scheme", SECRET],
  ])("refuses %s with a 401 and cleans nothing", async (_case, header) => {
    const { get } = setup();

    await expect(get(header)).resolves.toEqual({
      body: { code: "UNAUTHORIZED", message: "Unauthorized" },
      cacheControl: "no-store",
      status: 401,
    });
    expect(mocks.cleanUpOrphanBlobs).not.toHaveBeenCalled();
  });

  test("never runs open: without a configured secret it answers 503, whatever is sent", async () => {
    const { get } = setup({ secret: null });

    await expect(get("Bearer ")).resolves.toEqual({
      body: { code: "SERVICE_UNAVAILABLE", message: "CRON_SECRET is not set." },
      cacheControl: "no-store",
      status: 503,
    });
    expect(mocks.cleanUpOrphanBlobs).not.toHaveBeenCalled();
  });

  test("answers 503 without a Blob store to clean", async () => {
    const { get } = setup({ store: false });

    await expect(get(`Bearer ${SECRET}`)).resolves.toEqual({
      body: {
        code: "SERVICE_UNAVAILABLE",
        message: "BLOB_READ_WRITE_TOKEN is not set.",
      },
      cacheControl: "no-store",
      status: 503,
    });
    expect(mocks.cleanUpOrphanBlobs).not.toHaveBeenCalled();
  });

  test("a failed cleanup is reported once, with the request's id, and answers 500", async () => {
    const { failure, get } = setup({ cleanupFails: true });

    await expect(get(`Bearer ${SECRET}`)).resolves.toEqual({
      body: {
        code: "INTERNAL_SERVER_ERROR",
        eventId: "event-1",
        message: "The cleanup failed.",
      },
      cacheControl: "no-store",
      status: 500,
    });
    expect(mocks.captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      failure,
      { action: "Upload.clean_up_blobs", requestId: "req-7" }
    );
  });
});
