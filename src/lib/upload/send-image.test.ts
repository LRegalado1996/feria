import { ORPCError } from "@orpc/client";
import { describe, expect, test, vi } from "vitest";

import { ERROR_WHYS } from "@/lib/errors";

import { isUploadsNotConfigured, sendImage } from "./send-image";

const { put } = vi.hoisted(() => ({ put: vi.fn() }));

vi.mock("@vercel/blob/client", () => ({ put }));

const PREPARED = {
  blob: new Blob(["photo"], { type: "image/png" }),
  contentType: "image/png" as const,
  height: 900,
  width: 900,
};

describe("isUploadsNotConfigured", () => {
  test.each([
    [
      "the typed 503 of a server without its store",
      new ORPCError("SERVICE_UNAVAILABLE", {
        data: { why: ERROR_WHYS.UPLOADS_NOT_CONFIGURED },
      }),
      true,
    ],
    [
      "a 503 for another reason",
      new ORPCError("SERVICE_UNAVAILABLE", { data: { why: "other" } }),
      false,
    ],
    ["a 503 without data", new ORPCError("SERVICE_UNAVAILABLE"), false],
    [
      "another code with the same why",
      new ORPCError("BAD_REQUEST", {
        data: { why: ERROR_WHYS.UPLOADS_NOT_CONFIGURED },
      }),
      false,
    ],
    ["a plain error", new Error("offline"), false],
  ])("is %s → %s", (_case, error, expected) => {
    expect(isUploadsNotConfigured(error)).toBe(expected);
  });
});

describe("sendImage", () => {
  function setup() {
    let progress: (event: { percentage: number }) => void = () => undefined;
    let finish: (url: string) => void = () => undefined;
    put.mockImplementation(
      async (
        _pathname: string,
        _blob: Blob,
        options: { onUploadProgress: typeof progress }
      ) => {
        progress = options.onUploadProgress;
        return await new Promise<{ url: string }>((resolve) => {
          finish = (url) => {
            resolve({ url });
          };
        });
      }
    );
    const onProgress = vi.fn();
    const signal = new AbortController().signal;
    const sent = sendImage({
      onProgress,
      pathname: "local/product/a.png",
      prepared: PREPARED,
      signal,
      token: "vercel_blob_client_Store9_signed",
    });

    return {
      finish: (url: string) => {
        finish(url);
      },
      onProgress,
      progress: (percentage: number) => {
        progress({ percentage });
      },
      sent,
      signal,
    };
  }

  test("sends the photo with its type, token and signal, and answers its address", async () => {
    const { finish, sent, signal } = setup();

    finish("https://store9.public.blob.vercel-storage.com/local/product/a.png");

    await expect(sent).resolves.toBe(
      "https://store9.public.blob.vercel-storage.com/local/product/a.png"
    );
    expect(put).toHaveBeenCalledExactlyOnceWith(
      "local/product/a.png",
      PREPARED.blob,
      {
        abortSignal: signal,
        access: "public",
        contentType: "image/png",
        onUploadProgress: expect.any(Function),
        token: "vercel_blob_client_Store9_signed",
      }
    );
  });

  test("passes progress on until the transfer settles, and drops it after", async () => {
    const { finish, onProgress, progress, sent } = setup();

    progress(40);
    finish("https://store9.public.blob.vercel-storage.com/local/product/a.png");
    await sent;
    progress(100);

    expect(onProgress.mock.calls).toEqual([[40]]);
  });
});
