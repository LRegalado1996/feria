import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { UploadedImage } from "@/lib/schemas/upload";
import type * as PrepareImage from "@/lib/upload/prepare-image";
import { UnreadableImageError } from "@/lib/upload/prepare-image";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { required } from "@/test/required";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useImageUpload } from "./use-image-upload";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The Blob SDK and the canvas are doubles: no test uploads anything. The
// token request is real HTTP, answered by MSW.
const mocks = vi.hoisted(() => ({
  prepareImage: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({ put: mocks.put }));
vi.mock("@/lib/upload/prepare-image", async (importOriginal) => ({
  ...(await importOriginal<typeof PrepareImage>()),
  prepareImage: mocks.prepareImage,
}));
vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const PATHNAME = "local/cover/0f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e.webp";
const URL_UPLOADED = `https://store9.public.blob.vercel-storage.com/${PATHNAME}`;

function makePrepared(size = 900_000) {
  return {
    blob: new Blob([new Uint8Array(size)], { type: "image/webp" }),
    contentType: "image/webp" as const,
    height: 1600,
    width: 2400,
  };
}

interface PutOptions {
  abortSignal: AbortSignal;
  onUploadProgress: (event: { percentage: number }) => void;
}

/**
 * The hook over a token endpoint that answers (or refuses) and a store that
 * holds each upload open until the test settles it.
 */
function setup({
  holdsToken = false,
  ignoresAbort = false,
  prepared = makePrepared(),
  tokenFails = false,
}: {
  /** The token's answer waits for `giveToken()`. */
  holdsToken?: boolean;
  /** The store finishes an upload even once it was aborted. */
  ignoresAbort?: boolean;
  prepared?: ReturnType<typeof makePrepared> | Error;
  tokenFails?: boolean;
} = {}) {
  let releaseToken = (): void => undefined;
  const tokenReady = new Promise<undefined>((resolve) => {
    releaseToken = () => {
      resolve(undefined);
    };
  });

  if (!holdsToken) {
    releaseToken();
  }

  const tokenRequests = vi.fn(async (_input: unknown) => {
    await tokenReady;

    return {
      pathname: PATHNAME,
      token: "vercel_blob_client_Store9_signed",
    };
  });
  server.use(
    tokenFails
      ? createOrpcErrorHandler("upload.createToken", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
          status: 500,
        })
      : createOrpcHandler("upload.createToken", tokenRequests)
  );

  if (prepared instanceof Error) {
    mocks.prepareImage.mockRejectedValue(prepared);
  } else {
    mocks.prepareImage.mockResolvedValue(prepared);
  }

  const uploads: {
    fail: (error: Error) => void;
    finish: () => void;
    options: PutOptions;
  }[] = [];
  mocks.put.mockImplementation(
    async (_pathname: string, _body: Blob, options: PutOptions) =>
      await new Promise((resolve, reject) => {
        if (!ignoresAbort) {
          options.abortSignal.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }
        uploads.push({
          fail: reject,
          finish: () => {
            resolve({ pathname: PATHNAME, url: URL_UPLOADED });
          },
          options,
        });
      })
  );
  const onUploaded = vi.fn<(image: UploadedImage) => void>();
  const { result, unmount } = renderHook(
    () => useImageUpload({ onUploaded, purpose: "cover" }),
    { wrapper: createQueryWrapper() }
  );
  const file = new File(["photo"], "IMG_0001.jpg", { type: "image/jpeg" });
  const upload = async (index = 0) => {
    await waitFor(() => {
      expect(uploads[index]).toBeDefined();
    });

    return required(uploads[index]);
  };

  return {
    file,
    giveToken: () => {
      releaseToken();
    },
    onUploaded,
    result,
    tokenRequests,
    unmount,
    upload,
  };
}

describe("useImageUpload", () => {
  test("prepares the photo, asks for a token for it, then sends it with its progress", async () => {
    const { file, onUploaded, result, tokenRequests, upload } = setup();

    act(() => {
      result.current.start(file);
    });
    const first = await upload();

    expect(mocks.prepareImage).toHaveBeenCalledExactlyOnceWith(file);
    expect(tokenRequests).toHaveBeenCalledExactlyOnceWith({
      contentType: "image/webp",
      purpose: "cover",
      size: 900_000,
    });
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith(
      PATHNAME,
      expect.any(Blob),
      expect.objectContaining({
        access: "public",
        contentType: "image/webp",
        token: "vercel_blob_client_Store9_signed",
      })
    );
    expect(result.current.state).toEqual({ percent: 0, status: "uploading" });

    act(() => {
      first.options.onUploadProgress({ percentage: 42 });
    });
    expect(result.current.state).toEqual({ percent: 42, status: "uploading" });

    act(() => {
      first.finish();
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "done" });
    });
    expect(onUploaded).toHaveBeenCalledExactlyOnceWith({
      height: 1600,
      url: URL_UPLOADED,
      width: 2400,
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  test("says it is preparing while the photo is downscaled", async () => {
    const { file, result } = setup();
    mocks.prepareImage.mockReturnValue(new Promise<never>(() => {}));

    act(() => {
      result.current.start(file);
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "preparing" });
    });
  });

  test("a failed upload is reported, then retried with the same photo and a new token", async () => {
    const { file, onUploaded, result, tokenRequests, upload } = setup();
    act(() => {
      result.current.start(file);
    });
    const failed = new Error("Network request failed");
    const first = await upload(0);
    act(() => {
      first.fail(failed);
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        reason: "failed",
        status: "failed",
      });
    });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failed, {
      action: "Upload.upload_image",
      context: { prepared: true, purpose: "cover" },
    });

    act(() => {
      result.current.retry();
    });
    const second = await upload(1);
    act(() => {
      second.finish();
    });

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledExactlyOnceWith({
        height: 1600,
        url: URL_UPLOADED,
        width: 2400,
      });
    });
    expect(mocks.prepareImage).toHaveBeenCalledExactlyOnceWith(file);
    expect(tokenRequests.mock.calls).toEqual([
      [{ contentType: "image/webp", purpose: "cover", size: 900_000 }],
      [{ contentType: "image/webp", purpose: "cover", size: 900_000 }],
    ]);
  });

  test("a refused token fails the upload before anything is sent", async () => {
    const { file, result } = setup({ tokenFails: true });

    act(() => {
      result.current.start(file);
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({
        reason: "failed",
        status: "failed",
      });
    });
    expect(mocks.put).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      {
        action: "Upload.upload_image",
        context: { prepared: true, purpose: "cover" },
      }
    );
  });

  test("cancelling stops the upload and nothing is handed over", async () => {
    const { file, onUploaded, result, upload } = setup();
    act(() => {
      result.current.start(file);
    });
    const first = await upload();

    act(() => {
      result.current.cancel();
    });

    expect(first.options.abortSignal.aborted).toBe(true);
    expect(result.current.state).toEqual({ status: "cancelled" });
    // The aborted request's rejection lands after the cancel and changes nothing.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toEqual({ status: "cancelled" });
    expect(onUploaded).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a token that arrives after a cancel sends nothing", async () => {
    const { file, giveToken, result, tokenRequests } = setup({
      holdsToken: true,
    });
    act(() => {
      result.current.start(file);
    });
    await waitFor(() => {
      expect(tokenRequests).toHaveBeenCalledExactlyOnceWith({
        contentType: "image/webp",
        purpose: "cover",
        size: 900_000,
      });
    });

    act(() => {
      result.current.cancel();
    });
    await act(async () => {
      giveToken();
      await tokenRequests.mock.results[0]?.value;
    });

    expect(mocks.put).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: "cancelled" });
  });

  test("an upload the store finishes just after a cancel is not handed over", async () => {
    const { file, onUploaded, result, upload } = setup({ ignoresAbort: true });
    act(() => {
      result.current.start(file);
    });
    const first = await upload();

    await act(async () => {
      result.current.cancel();
      first.finish();
      await mocks.put.mock.results[0]?.value;
    });

    expect(onUploaded).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: "cancelled" });
  });

  test("leaving the form while the token is on its way sends nothing", async () => {
    const { file, giveToken, onUploaded, result, tokenRequests, unmount } =
      setup({ holdsToken: true });

    act(() => {
      result.current.start(file);
    });
    await waitFor(() => {
      expect(tokenRequests).toHaveBeenCalledOnce();
    });
    unmount();
    giveToken();

    // The token's answer has come and gone, and nothing was sent with it.
    await waitFor(() => {
      expect(tokenRequests.mock.results[0]?.type).toBe("return");
    });
    await act(async () => {
      await tokenRequests.mock.results[0]?.value;
    });
    expect(mocks.put).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  test("leaving the form mid-upload aborts it and hands nothing over", async () => {
    const { file, onUploaded, result, unmount, upload } = setup({
      ignoresAbort: true,
    });
    act(() => {
      result.current.start(file);
    });
    const sending = await upload();

    unmount();
    expect(sending.options.abortSignal.aborted).toBe(true);
    // A store that finishes anyway is not listened to.
    await act(async () => {
      sending.finish();
      await Promise.resolve();
    });

    expect(onUploaded).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a photo the browser cannot read asks for another, unreported and without a retry", async () => {
    const { file, result, tokenRequests } = setup({
      prepared: new UnreadableImageError(),
    });

    act(() => {
      result.current.start(file);
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        reason: "unreadable",
        status: "failed",
      });
    });

    act(() => {
      result.current.retry();
    });
    expect(mocks.prepareImage).toHaveBeenCalledExactlyOnceWith(file);
    expect(tokenRequests).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a photo exactly at the cap after preparing is sent", async () => {
    const { file, result, tokenRequests, upload } = setup({
      prepared: makePrepared(5_000_000),
    });

    act(() => {
      result.current.start(file);
    });
    await upload();

    expect(tokenRequests).toHaveBeenCalledExactlyOnceWith({
      contentType: "image/webp",
      purpose: "cover",
      size: 5_000_000,
    });
    expect(result.current.state).toEqual({ percent: 0, status: "uploading" });
  });

  test("a photo one byte over the cap after preparing asks for no token", async () => {
    const { file, result, tokenRequests } = setup({
      prepared: makePrepared(5_000_001),
    });

    act(() => {
      result.current.start(file);
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({
        reason: "tooLarge",
        status: "failed",
      });
    });
    expect(tokenRequests).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  test("a second photo chosen mid-upload replaces the first, whose end is ignored", async () => {
    const { file, onUploaded, result, upload } = setup();
    act(() => {
      result.current.start(file);
    });
    const first = await upload(0);

    act(() => {
      result.current.start(new File(["other"], "IMG_0002.jpg"));
    });
    const second = await upload(1);

    expect(first.options.abortSignal.aborted).toBe(true);
    act(() => {
      first.options.onUploadProgress({ percentage: 90 });
      second.options.onUploadProgress({ percentage: 10 });
    });
    expect(result.current.state).toEqual({ percent: 10, status: "uploading" });
    act(() => {
      second.finish();
    });
    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledExactlyOnceWith({
        height: 1600,
        url: URL_UPLOADED,
        width: 2400,
      });
    });
  });
});
