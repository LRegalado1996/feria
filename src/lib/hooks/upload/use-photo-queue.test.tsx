import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ERROR_WHYS } from "@/lib/errors";
import { reportError } from "@/lib/errors/client";
import type * as PrepareImage from "@/lib/upload/prepare-image";
import { UnreadableImageError } from "@/lib/upload/prepare-image";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { required } from "@/test/required";
import { createQueryWrapper } from "@/test/setup-helpers";

import { type QueuedPhotoUploaded, usePhotoQueue } from "./use-photo-queue";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The Blob SDK and the canvas are doubles: nothing is uploaded. The token
// request is real HTTP, answered by MSW.
const mocks = vi.hoisted(() => ({ prepareImage: vi.fn(), put: vi.fn() }));

vi.mock("@vercel/blob/client", () => ({ put: mocks.put }));
vi.mock("@/lib/upload/prepare-image", async (importOriginal) => ({
  ...(await importOriginal<typeof PrepareImage>()),
  prepareImage: mocks.prepareImage,
}));
vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

function makePrepared(size = 800_000) {
  return {
    blob: new Blob([new Uint8Array(size)], { type: "image/webp" }),
    contentType: "image/webp" as const,
    height: 1200,
    width: 1600,
  };
}

/** What the queue asks the token for, for a photo prepared at `size`. */
function makeTokenInput(size = 800_000) {
  return { contentType: "image/webp", purpose: "product", size };
}

function makeFile(
  name: string,
  { size, type = "image/jpeg" } = {} as {
    size?: number;
    type?: string;
  }
) {
  const file = new File(["photo"], name, { type });

  if (size !== undefined) {
    Object.defineProperty(file, "size", { value: size });
  }

  return file;
}

/**
 * Resolves once every continuation already queued has run: a macrotask
 * runs only on an empty microtask queue. Awaited after the signal that set
 * the continuation going (an answer that reached the queue, a promise the
 * test settled), never in place of one.
 */
async function drained() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface PutOptions {
  abortSignal: AbortSignal;
  onUploadProgress: (event: { percentage: number }) => void;
}

/**
 * The queue over a token endpoint that answers (or refuses) and a store
 * that holds each upload open until the test settles it.
 */
function setup({
  holdsToken = false,
  ignoresAbort = false,
  prepared = makePrepared(),
  token = "answers",
}: {
  holdsToken?: boolean;
  /** The store finishes an upload even once it was aborted. */
  ignoresAbort?: boolean;
  prepared?: ReturnType<typeof makePrepared> | Error;
  token?: "answers" | "fails" | "notConfigured";
} = {}) {
  let tokens = 0;
  let giveToken = (): void => undefined;
  const tokenGate = new Promise<void>((resolve) => {
    giveToken = resolve;
  });

  if (!holdsToken) {
    giveToken();
  }

  const tokenRequests = vi.fn(async (_input: unknown) => {
    await tokenGate;
    tokens += 1;
    return {
      pathname: `local/product/${tokens}.webp`,
      token: "vercel_blob_client_Store9_signed",
    };
  });
  server.use(
    token === "answers"
      ? createOrpcHandler("upload.createToken", tokenRequests)
      : createOrpcErrorHandler("upload.createToken", {
          code:
            token === "fails" ? "INTERNAL_SERVER_ERROR" : "SERVICE_UNAVAILABLE",
          data:
            token === "fails"
              ? undefined
              : { why: ERROR_WHYS.UPLOADS_NOT_CONFIGURED },
          message: "No token",
          status: token === "fails" ? 500 : 503,
        })
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
    pathname: string;
  }[] = [];
  mocks.put.mockImplementation(
    async (pathname: string, _body: Blob, options: PutOptions) =>
      await new Promise((resolve, reject) => {
        options.abortSignal.addEventListener("abort", () => {
          if (ignoresAbort) {
            return;
          }

          reject(new Error("aborted"));
        });
        uploads.push({
          fail: reject,
          finish: () => {
            resolve({
              url: `https://store9.public.blob.vercel-storage.com/${pathname}`,
            });
          },
          options,
          pathname,
        });
      })
  );
  let previews = 0;
  const createObjectURL = vi
    .spyOn(URL, "createObjectURL")
    .mockImplementation(() => {
      previews += 1;
      return `blob:preview-${previews}`;
    });
  const revokeObjectURL = vi
    .spyOn(URL, "revokeObjectURL")
    .mockImplementation(() => undefined);
  const onUploaded = vi.fn<(photo: QueuedPhotoUploaded) => void>();
  const wrapper = createQueryWrapper();
  const mutations = wrapper.queryClient.getMutationCache();
  const { result, unmount } = renderHook(
    () => usePhotoQueue({ onUploaded, purpose: "product" }),
    { wrapper }
  );
  /**
   * Resolves once a token's answer reached the queue, over HTTP: asked
   * before the answer is given, so it cannot miss it.
   */
  const tokenAnswered = async () => {
    await new Promise<void>((resolve) => {
      const stop = mutations.subscribe((event) => {
        if (event.mutation?.state.status === "success") {
          stop();
          resolve();
        }
      });
    });
  };
  /** The tokens the queue has asked for so far, answered or not. */
  const tokensAsked = () =>
    mutations.getAll().map((mutation) => mutation.state.variables);
  const upload = async (index: number) => {
    await waitFor(() => {
      expect(uploads[index]).toBeDefined();
    });

    return required(uploads[index]);
  };
  const add = (files: File[], photoCount = 0) => {
    let refusals: ReturnType<typeof result.current.add> = [];
    act(() => {
      refusals = result.current.add(files, photoCount);
    });
    return refusals;
  };

  return {
    add,
    createObjectURL,
    giveToken,
    onUploaded,
    result,
    revokeObjectURL,
    tokenAnswered,
    tokenRequests,
    tokensAsked,
    unmount,
    upload,
    uploads,
  };
}

describe("usePhotoQueue", () => {
  test("shows the photos at once, sends the first alone while the article has none, then two at a time", async () => {
    const { add, onUploaded, result, tokenRequests, upload, uploads } = setup();

    add([makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")]);

    expect(
      result.current.items.map(({ name, preview }) => [name, preview])
    ).toEqual([
      ["a.jpg", "blob:preview-1"],
      ["b.jpg", "blob:preview-2"],
      ["c.jpg", "blob:preview-3"],
    ]);
    const first = await upload(0);
    expect(tokenRequests).toHaveBeenCalledExactlyOnceWith(makeTokenInput());
    expect(uploads).toHaveLength(1);
    expect(result.current.items[1]?.state).toEqual({ status: "waiting" });

    act(() => {
      first.finish();
    });

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledExactlyOnceWith({
        image: {
          height: 1200,
          url: "https://store9.public.blob.vercel-storage.com/local/product/1.webp",
          width: 1600,
        },
        key: expect.stringMatching(/^photo-\d+$/u),
        preview: "blob:preview-1",
      });
    });
    await upload(2);
    expect(uploads.map((one) => one.pathname)).toEqual([
      "local/product/1.webp",
      "local/product/2.webp",
      "local/product/3.webp",
    ]);
    expect(result.current.items.map((item) => item.name)).toEqual([
      "b.jpg",
      "c.jpg",
    ]);
  });

  test("sends two at once when the article already has a photo, and never a third", async () => {
    const { add, upload, uploads } = setup();

    add([makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")], 1);

    await upload(1);
    expect(uploads).toHaveLength(2);
  });

  test("says how a photo travels: preparing, then its progress", async () => {
    const { add, result, upload } = setup();
    let finishPreparing = (_value: unknown): void => undefined;
    mocks.prepareImage.mockReturnValue(
      new Promise((resolve) => {
        finishPreparing = resolve;
      })
    );

    add([makeFile("a.jpg")]);
    await waitFor(() => {
      expect(result.current.items[0]?.state).toEqual({ status: "preparing" });
    });

    finishPreparing(makePrepared());
    const first = await upload(0);
    act(() => {
      first.options.onUploadProgress({ percentage: 42 });
    });

    expect(result.current.items[0]?.state).toEqual({
      percent: 42,
      status: "uploading",
    });
  });

  test.each([
    [
      "a file that is not an image",
      makeFile("notes.pdf", { type: "application/pdf" }),
      [{ kind: "notImage", name: "notes.pdf" }],
      0,
    ],
    [
      "a file over 25 MB",
      makeFile("big.jpg", { size: 25_000_001 }),
      [{ kind: "tooBig", name: "big.jpg" }],
      0,
    ],
    [
      "a file of exactly 25 MB",
      makeFile("ok.jpg", { size: 25_000_000 }),
      [],
      1,
    ],
  ])("refuses at once %s, or takes it", (_case, file, refusals, queued) => {
    const { add, createObjectURL, result } = setup();

    expect(add([file])).toEqual(refusals);
    expect(result.current.items).toHaveLength(queued);
    expect(createObjectURL).toHaveBeenCalledTimes(queued);
  });

  test.each([
    [7, 3, 1, { count: 2, kind: "tooMany" }],
    [6, 2, 2, null],
    [8, 1, 0, { count: 1, kind: "tooMany" }],
  ])(
    "beside %s photos, of %s chosen takes %s",
    (photoCount, chosen, taken, refusal) => {
      const { add, result } = setup();

      const refusals = add(
        Array.from({ length: chosen }, (_, index) => makeFile(`${index}.jpg`)),
        photoCount
      );

      expect(result.current.items).toHaveLength(taken);
      expect(refusals).toEqual(refusal ? [refusal] : []);
    }
  );

  test("counts the photos already queued against the eight", () => {
    const { add, result } = setup();

    add(
      Array.from({ length: 5 }, (_, index) => makeFile(`${index}.jpg`)),
      2
    );
    const refusals = add([makeFile("x.jpg"), makeFile("y.jpg")], 2);

    expect(result.current.items).toHaveLength(6);
    expect(refusals).toEqual([{ count: 1, kind: "tooMany" }]);
  });

  test("keeps a failed photo with its reason, reports it, and retries it prepared as it was", async () => {
    const { add, result, tokenRequests, upload } = setup();
    const file = makeFile("a.jpg");
    add([file], 1);
    const first = await upload(0);

    act(() => {
      first.fail(new Error("network"));
    });

    await waitFor(() => {
      expect(result.current.items[0]?.state).toEqual({
        reason: "failed",
        status: "failed",
      });
    });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(new Error("network"), {
      action: "Product.upload_photo",
      context: { prepared: true, purpose: "product", reason: "failed" },
    });

    act(() => {
      result.current.retry(required(result.current.items[0]).key);
    });

    await upload(1);
    // Prepared once, within the article photo's own cap; a fresh token each.
    expect(mocks.prepareImage).toHaveBeenCalledExactlyOnceWith(file, {
      maxBytes: 4_000_000,
    });
    expect(tokenRequests.mock.calls).toEqual([
      [makeTokenInput()],
      [makeTokenInput()],
    ]);
  });

  test.each([
    [
      "a file the browser cannot read, unreported",
      { prepared: new UnreadableImageError() },
      "unreadable",
      [],
    ],
    [
      "a server without its store, reported once",
      { token: "notConfigured" as const },
      "notConfigured",
      [
        [
          expect.objectContaining({
            code: "SERVICE_UNAVAILABLE",
            message: "No token",
          }),
          {
            action: "Product.upload_photo",
            context: {
              prepared: true,
              purpose: "product",
              reason: "notConfigured",
            },
          },
        ],
      ],
    ],
    [
      "a photo still too heavy once prepared",
      { prepared: makePrepared(4_000_001) },
      "tooLarge",
      [],
    ],
  ])("fails %s, with no retry", async (_case, options, reason, reports) => {
    const { add, result } = setup(options);
    add([makeFile("a.jpg")], 1);

    await waitFor(() => {
      expect(result.current.items[0]?.state).toEqual({
        reason,
        status: "failed",
      });
    });
    expect(vi.mocked(reportError).mock.calls).toEqual(reports);

    act(() => {
      result.current.retry(required(result.current.items[0]).key);
    });
    expect(result.current.items[0]?.state).toEqual({
      reason,
      status: "failed",
    });
  });

  test("a photo of exactly the 4 MB cap travels", async () => {
    const { add, result, upload } = setup({
      prepared: makePrepared(4_000_000),
    });

    add([makeFile("a.jpg")], 1);

    await upload(0);
    expect(result.current.items[0]?.state).toEqual({
      percent: 0,
      status: "uploading",
    });
  });

  test("removing a photo on its way stops it, frees its thumbnail and starts the next", async () => {
    const { add, onUploaded, result, revokeObjectURL, upload } = setup();
    add([makeFile("a.jpg"), makeFile("b.jpg")]);
    const first = await upload(0);

    act(() => {
      result.current.remove(required(result.current.items[0]).key);
    });

    expect(first.options.abortSignal.aborted).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:preview-1");
    expect(result.current.items.map((item) => item.name)).toEqual(["b.jpg"]);
    await upload(1);
    expect(onUploaded).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("leaving stops every upload and frees the thumbnails still queued", async () => {
    const { add, revokeObjectURL, unmount, upload } = setup();
    add([makeFile("a.jpg"), makeFile("b.jpg")], 1);
    const first = await upload(0);
    const second = await upload(1);

    unmount();

    expect(first.options.abortSignal.aborted).toBe(true);
    expect(second.options.abortSignal.aborted).toBe(true);
    expect(revokeObjectURL.mock.calls).toEqual([
      ["blob:preview-1"],
      ["blob:preview-2"],
    ]);
  });

  test("a token that arrives after the photo was removed sends nothing", async () => {
    const { add, giveToken, result, tokenAnswered, tokenRequests, uploads } =
      setup({ holdsToken: true });
    add([makeFile("a.jpg")], 1);
    await waitFor(() => {
      expect(tokenRequests).toHaveBeenCalledExactlyOnceWith(makeTokenInput());
    });

    act(() => {
      result.current.remove(required(result.current.items[0]).key);
    });
    const answered = tokenAnswered();
    giveToken();
    await answered;
    await drained();

    expect(result.current.items).toEqual([]);
    expect(uploads).toHaveLength(0);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  test("removing the first photo while its token is awaited starts the next at once", async () => {
    const { add, result, tokenRequests } = setup({ holdsToken: true });
    // The article has no photo: the first one travels alone.
    add([makeFile("a.jpg"), makeFile("b.jpg")]);
    await waitFor(() => {
      expect(tokenRequests).toHaveBeenCalledExactlyOnceWith(makeTokenInput());
    });

    act(() => {
      result.current.remove(required(result.current.items[0]).key);
    });

    // The token never answers, and the second photo asks for its own.
    await waitFor(() => {
      expect(tokenRequests.mock.calls).toEqual([
        [makeTokenInput()],
        [makeTokenInput()],
      ]);
    });
    expect(result.current.items.map((item) => item.name)).toEqual(["b.jpg"]);
  });

  test("a photo removed while it is prepared asks for no token", async () => {
    const { add, result, tokenRequests, tokensAsked } = setup();
    let finishPreparing = (_value: unknown): void => undefined;
    const preparing = new Promise((resolve) => {
      finishPreparing = resolve;
    });
    mocks.prepareImage.mockReturnValue(preparing);
    add([makeFile("a.jpg")], 1);
    await waitFor(() => {
      expect(result.current.items[0]?.state).toEqual({ status: "preparing" });
    });

    act(() => {
      result.current.remove(required(result.current.items[0]).key);
    });
    finishPreparing(makePrepared());
    // The queue awaited this promise first, so it went on before this does.
    await preparing;
    await drained();

    // A token is asked for in the very step the queue goes on, before any
    // request leaves: none was.
    expect(tokensAsked()).toEqual([]);
    expect(tokenRequests).not.toHaveBeenCalled();
  });

  test("an upload the store finishes after the photo was removed is handed to nobody", async () => {
    const { add, onUploaded, result, upload } = setup({ ignoresAbort: true });
    add([makeFile("a.jpg")], 1);
    const first = await upload(0);

    act(() => {
      result.current.remove(required(result.current.items[0]).key);
    });
    act(() => {
      first.finish();
    });
    await drained();

    expect(onUploaded).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });
});
