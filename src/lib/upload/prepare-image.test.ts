import { describe, expect, test, vi } from "vitest";

import { prepareImage, UnreadableImageError } from "./prepare-image";

// No browser here: the decoder and the canvas are doubles that record what
// they were asked, and encode only the types `encodes` lists, as a browser
// that cannot write WebP answers PNG instead.

function setup({
  alpha = 255,
  encodes = ["image/webp", "image/jpeg"],
  height = 3000,
  pngBytes = [100],
  pngFails = false,
  readable = true,
  type = "image/jpeg",
  width = 4000,
  withContext = true,
}: {
  /** The alpha of the drawing's last pixel; every other pixel is opaque. */
  alpha?: number;
  encodes?: string[];
  height?: number;
  /** The size of each PNG the browser writes, one per attempt. */
  pngBytes?: number[];
  /** The browser answers a PNG request with nothing, as a canvas too big. */
  pngFails?: boolean;
  readable?: boolean;
  type?: string;
  width?: number;
  withContext?: boolean;
} = {}) {
  const bitmap = { close: vi.fn(), height, width };
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
      // Four bytes a pixel, all opaque but the last pixel's alpha.
      const data = new Uint8ClampedArray(Math.min(w * h, 4) * 4).fill(255);
      data[data.length - 1] = alpha;
      return { data };
    }),
    imageSmoothingQuality: "",
  };
  const canvases: { height: number; width: number }[] = [];
  let pngs = 0;
  const toBlob = vi.fn(
    (done: (blob: Blob | null) => void, kind: string, quality: number) => {
      if (kind === "image/png") {
        if (pngFails) {
          done(null);
          return;
        }

        const size = pngBytes[Math.min(pngs, pngBytes.length - 1)] ?? 0;
        pngs += 1;
        done(new Blob([new Uint8Array(size)], { type: "image/png" }));
        return;
      }

      done(
        new Blob([`${kind}@${quality}`], {
          type: encodes.includes(kind) ? kind : "image/png",
        })
      );
    }
  );
  const createElement = vi.fn((tag: string) => {
    if (tag !== "canvas") {
      return null;
    }

    const canvas = {
      getContext: vi.fn((_kind: string) => (withContext ? context : null)),
      height: 0,
      toBlob,
      width: 0,
    };
    canvases.push(canvas);
    return canvas;
  });
  const decode = vi.fn(async (_file: Blob, _options: unknown) => {
    if (!readable) {
      throw new DOMException("The source image could not be decoded.");
    }
    return await Promise.resolve(bitmap);
  });
  vi.stubGlobal("createImageBitmap", decode);
  vi.stubGlobal("document", { createElement });
  const file = new Blob(["photo"], { type });
  const sizes = () =>
    canvases.map((canvas) => [canvas.width, canvas.height] as const);
  const encoded = () => toBlob.mock.calls.map(([, kind]) => kind);

  return { bitmap, context, decode, encoded, file, sizes };
}

describe("prepareImage", () => {
  test("draws a large photo upright at 2400 px on its longest side and encodes it as WebP", async () => {
    const { bitmap, context, decode, file, sizes } = setup();

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
    expect(sizes()).toEqual([[2400, 1800]]);
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
    const { encoded, file } = setup({ encodes: ["image/jpeg"] });

    const prepared = await prepareImage(file);

    expect(prepared.contentType).toBe("image/jpeg");
    await expect(prepared.blob.text()).resolves.toBe("image/jpeg@0.85");
    expect(encoded()).toEqual(["image/webp", "image/jpeg"]);
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

  test.each([
    ["a PNG", "image/png"],
    ["a WebP", "image/webp"],
  ])(
    "keeps the transparency of %s as WebP with its alpha, painting nothing under it and reading no pixel",
    async (_case, type) => {
      const { context, encoded, file } = setup({ alpha: 0, type });

      const prepared = await prepareImage(file);

      expect(prepared.contentType).toBe("image/webp");
      expect(encoded()).toEqual(["image/webp"]);
      // WebP keeps the alpha anyway: reading the whole canvas would be waste.
      expect(context.getImageData).not.toHaveBeenCalled();
      expect(context).not.toHaveProperty("fillStyle");
    }
  );

  test.each([
    [
      "a transparent image becomes PNG",
      0,
      "image/png",
      ["image/webp", "image/png"],
    ],
    [
      "a half-transparent pixel is transparency too",
      254,
      "image/png",
      ["image/webp", "image/png"],
    ],
    [
      "an opaque PNG becomes JPEG",
      255,
      "image/jpeg",
      ["image/webp", "image/jpeg"],
    ],
  ])(
    "where WebP cannot be written, %s",
    async (_case, alpha, contentType, calls) => {
      const { context, encoded, file } = setup({
        alpha,
        encodes: ["image/jpeg"],
        type: "image/png",
      });

      await expect(prepareImage(file)).resolves.toMatchObject({ contentType });
      expect(encoded()).toEqual(calls);
      expect(context.getImageData).toHaveBeenCalledExactlyOnceWith(
        0,
        0,
        2400,
        1800
      );
    }
  );

  test("never inspects the pixels of a JPEG, which has no transparency", async () => {
    const { context, file } = setup({ alpha: 0, encodes: ["image/jpeg"] });

    await expect(prepareImage(file)).resolves.toMatchObject({
      contentType: "image/jpeg",
    });
    expect(context.getImageData).not.toHaveBeenCalled();
  });

  test.each([
    ["exactly at the cap is kept at its size", [1000], 1000, [[2400, 1800]]],
    [
      "one byte over is drawn smaller in proportion, then kept",
      [4000, 900],
      1000,
      [
        [2400, 1800],
        [1080, 810],
      ],
    ],
  ])("a transparent PNG %s", async (_case, pngBytes, maxBytes, expected) => {
    const { encoded, file, sizes } = setup({
      alpha: 0,
      encodes: ["image/jpeg"],
      pngBytes,
      type: "image/png",
    });

    const prepared = await prepareImage(file, { maxBytes });

    expect(sizes()).toEqual(expected);
    expect(prepared).toMatchObject({
      contentType: "image/png",
      height: expected.at(-1)?.[1],
      width: expected.at(-1)?.[0],
    });
    expect(encoded().filter((kind) => kind === "image/png")).toHaveLength(
      pngBytes.length
    );
  });

  test("hands over a PNG still over the cap after four smaller drawings, for the upload to refuse", async () => {
    const { file, sizes } = setup({
      alpha: 0,
      encodes: ["image/jpeg"],
      pngBytes: [4000],
      type: "image/png",
    });

    const prepared = await prepareImage(file, { maxBytes: 1000 });

    expect(sizes()).toHaveLength(5);
    expect(prepared.blob.size).toBe(4000);
    expect(prepared.contentType).toBe("image/png");
  });

  test("throws when the browser can write no PNG for a transparent image", async () => {
    const { bitmap, file } = setup({
      alpha: 0,
      encodes: ["image/jpeg"],
      pngFails: true,
      type: "image/png",
    });

    await expect(prepareImage(file)).rejects.toThrow(
      new Error("The browser could not encode the image")
    );
    expect(bitmap.close).toHaveBeenCalledExactlyOnceWith();
  });
});
