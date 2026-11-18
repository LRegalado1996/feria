import { describe, expect, test } from "vitest";

import { createUploadTokenSchema, uploadedImageSchema } from ".";

function makeTokenRequest(overrides: Record<string, unknown> = {}) {
  return {
    contentType: "image/webp",
    purpose: "cover",
    size: 1_200_000,
    ...overrides,
  };
}

function makeImage(overrides: Record<string, unknown> = {}) {
  return {
    height: 1600,
    url: "https://store9.public.blob.vercel-storage.com/qa/cover/a.webp",
    width: 2400,
    ...overrides,
  };
}

describe("createUploadTokenSchema", () => {
  test.each([
    ["a WebP", { contentType: "image/webp" }, true],
    ["a JPEG", { contentType: "image/jpeg" }, true],
    ["a PNG", { contentType: "image/png" }, true],
    ["a GIF", { contentType: "image/gif" }, false],
    ["an SVG", { contentType: "image/svg+xml" }, false],
    [
      "a HEIC the browser did not convert",
      { contentType: "image/heic" },
      false,
    ],
    ["no type", { contentType: "" }, false],
    ["a purpose nobody uses", { purpose: "avatar" }, false],
    ["exactly the cover's cap", { size: 5_000_000 }, true],
    ["one byte over it", { size: 5_000_001 }, false],
    [
      "exactly an article photo's cap",
      { purpose: "product", size: 4_000_000 },
      true,
    ],
    [
      "an article photo one byte over it",
      { purpose: "product", size: 4_000_001 },
      false,
    ],
    ["one byte", { size: 1 }, true],
    ["an empty file", { size: 0 }, false],
    ["a fractional size", { size: 10.5 }, false],
    ["a size sent as text", { size: "1200" }, false],
  ])("%s is accepted: %s", (_case, overrides, accepted) => {
    expect(
      createUploadTokenSchema.safeParse(makeTokenRequest(overrides)).success
    ).toBe(accepted);
  });

  test("says which field is over the cap", () => {
    const result = createUploadTokenSchema.safeParse(
      makeTokenRequest({ size: 5_000_001 })
    );

    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        message: "The image is larger than its purpose allows",
        path: ["size"],
      }),
    ]);
  });
});

describe("uploadedImageSchema", () => {
  test.each([
    ["a stored image", {}, true],
    ["the largest side", { width: 2400, height: 2400 }, true],
    ["one pixel over it", { width: 2401 }, false],
    ["one pixel", { height: 1, width: 1 }, true],
    ["no height", { height: 0 }, false],
    ["a fractional width", { width: 10.5 }, false],
    [
      "plain HTTP",
      { url: "http://store9.public.blob.vercel-storage.com/a.webp" },
      false,
    ],
    ["a data address", { url: "data:image/png;base64,iVBORw0KGgo=" }, false],
    ["no address", { url: "" }, false],
    [
      "an address past 500 characters",
      { url: `https://a.com/${"a".repeat(487)}` },
      false,
    ],
    [
      "an address of 500 characters",
      { url: `https://a.com/${"a".repeat(486)}` },
      true,
    ],
  ])("%s is accepted: %s", (_case, overrides, accepted) => {
    expect(uploadedImageSchema.safeParse(makeImage(overrides)).success).toBe(
      accepted
    );
  });

  test("keeps an address with its scheme and host in capitals as a URL writes it", () => {
    expect(
      uploadedImageSchema.parse(
        makeImage({
          url: "HTTPS://Store9.public.blob.vercel-storage.com/qa/cover/a.webp",
        })
      ).url
    ).toBe("https://store9.public.blob.vercel-storage.com/qa/cover/a.webp");
  });
});
