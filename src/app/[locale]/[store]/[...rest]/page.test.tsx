import { describe, expect, test } from "vitest";

import UnknownStorePage, { instant } from "./page";

describe("UnknownStorePage", () => {
  test("answers 404, which renders the store's own not-found page", () => {
    expect(() => {
      UnknownStorePage();
    }).toThrow(
      expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
    );
  });

  test("opts out of instant-navigation validation: it never renders", () => {
    expect(instant).toBe(false);
  });
});
