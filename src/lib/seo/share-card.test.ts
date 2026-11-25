import { describe, expect, test } from "vitest";

import { defaultShareImage } from "./share-card";

describe("defaultShareImage", () => {
  test.each([
    ["es", "/es/opengraph-image"],
    ["en", "/en/opengraph-image"],
  ] as const)(
    "in %s, points at that language's 1200 by 630 brand card, described by the brand's name",
    (locale, url) => {
      expect(defaultShareImage(locale)).toEqual({
        alt: "LR Market",
        height: 630,
        type: "image/png",
        url,
        width: 1200,
      });
    }
  );
});
