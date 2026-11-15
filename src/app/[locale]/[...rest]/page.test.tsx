import { describe, expect, test } from "vitest";

import UnknownPage, { instant } from "./page";

describe("UnknownPage", () => {
  test("answers 404, which renders the locale's not-found page", () => {
    expect(() => {
      UnknownPage();
    }).toThrow(
      expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
    );
  });

  test("opts out of instant-navigation validation: it never renders", () => {
    expect(instant).toBe(false);
  });
});
