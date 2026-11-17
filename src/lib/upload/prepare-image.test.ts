import { describe, expect, test, vi } from "vitest";

import { prepareImage, UnreadableImageError } from "./prepare-image";

// No browser here: the decoder and the canvas are doubles that record what
// they were asked, and encode only the types `encodes` lists, as a browser
// that cannot write WebP answers PNG instead.

function setup({
  encodes = ["image/webp", "image/jpeg"],
  height = 3000,
  readable = true,
  width = 4000,
  withContext = true,
}: {
  encodes?: string[];
  height?: number;
  readable?: boolean;
  width?: number;
  withContext?: boolean;
} = {}) {
  const bitmap = { close: vi.fn(), height, width };
  const context = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "",
    imageSmoothingQuality: "",
  };
  const canvas = {
    getContext: vi.fn((_kind: string) => (withContext ? context : null)),
    height: 0,
    toBlob: vi.fn(
      (done: (blob: Blob | null) => void, type: string, quality: number) => {
        done(
          new Blob([`${type}@${quality}`], {
            type: encodes.includes(type) ? type : "image/png",
          })
        );
      }
    ),
    width: 0,
  };
  const decode = vi.fn(async (_file: Blob, _options: unknown) => {
    if (!readable) {
      throw new DOMException("The source image could not be decoded.");
    }
    return await Promise.resolve(bitmap);
  });
  vi.stubGlobal("createImageBitmap", decode);
  vi.stubGlobal("document", {
    createElement: vi.fn((tag: string) => (tag === "canvas" ? canvas : null)),
  });
  const file = new Blob(["photo"], { type: "image/jpeg" });

  return { bitmap, canvas, context, decode, file };
}

describe("prepareImage", () => {
  test("draws a large photo upright at 2400 px on its longest side and encodes it as WebP", async () => {
    const { bitmap, canvas, context, decode, file } = setup();

    const prepared = await prepareImage(file);

    expect(decode).toHaveBeenCalledExactlyOnceWith(file, {
      imageOrientation: "from-image",
    });
    expect(prepared).toEqual({
      blob: expect.any(Blob),
      contentType: "image/webp",
      height: 1800,
      width: 2400,
    });
    await expect(prepared.blob.text()).resolves.toBe("image/webp@0.85");
    expect([canvas.width, canvas.height]).toEqual([2400, 1800]);
    expect(context.fillStyle).toBe("white");
    expect(context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 2400, 1800);
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(
      bitmap,
      0,
      0,
      2400,
      1800
    );
    expect(bitmap.close).toHaveBeenCalledExactlyOnceWith();
  });

  test.each([
    ["a portrait photo", 3000, 4000, 1800, 2400],
    ["exactly the cap", 2400, 1200, 2400, 1200],
    ["one pixel over the cap", 2401, 1000, 2400, 1000],
    ["a small photo, never enlarged", 640, 480, 640, 480],
    ["a sliver that would round to nothing", 10_000, 1, 2400, 1],
  ])("%s becomes %s x %s → %s x %s", async (_case, width, height, w, h) => {
    const { file } = setup({ height, width });

    await expect(prepareImage(file)).resolves.toMatchObject({
      height: h,
      width: w,
    });
  });

  test("honours a smaller cap when asked", async () => {
    const { file } = setup();

    await expect(prepareImage(file, { maxSide: 1000 })).resolves.toMatchObject({
      height: 750,
      width: 1000,
    });
  });

  test("falls back to JPEG where the browser cannot write WebP", async () => {
    const { canvas, file } = setup({ encodes: ["image/jpeg"] });

    const prepared = await prepareImage(file);

    expect(prepared.contentType).toBe("image/jpeg");
    await expect(prepared.blob.text()).resolves.toBe("image/jpeg@0.85");
    expect(canvas.toBlob.mock.calls.map(([, type]) => type)).toEqual([
      "image/webp",
      "image/jpeg",
    ]);
  });

  test("throws when the browser can encode neither", async () => {
    const { bitmap, file } = setup({ encodes: [] });

    await expect(prepareImage(file)).rejects.toThrow(
      new Error("The browser could not encode the image")
    );
    expect(bitmap.close).toHaveBeenCalledExactlyOnceWith();
  });

  test("throws when the browser gives no canvas to draw on", async () => {
    const { bitmap, file } = setup({ withContext: false });

    await expect(prepareImage(file)).rejects.toThrow(
      new Error("The browser gave no 2D canvas to draw the image on")
    );
    expect(bitmap.close).toHaveBeenCalledExactlyOnceWith();
  });

  test("calls a file the browser cannot decode unreadable, keeping the cause", async () => {
    const { file } = setup({ readable: false });

    const failure = await prepareImage(file).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnreadableImageError);
    expect(failure).toMatchObject({
      cause: { message: "The source image could not be decoded." },
      message: "The browser cannot read this image",
      name: "UnreadableImageError",
    });
  });
});
