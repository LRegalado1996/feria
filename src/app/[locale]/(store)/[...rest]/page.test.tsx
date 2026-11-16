import { describe, expect, test } from "vitest";

import UnknownStorePage, {
  ensureStatic,
  generateStaticParams,
  instant,
} from "./page";

describe("UnknownStorePage", () => {
  test("answers 404, which renders the store's own not-found page", () => {
    expect(() => {
      UnknownStorePage();
    }).toThrow(
      expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
    );
  });

  test("is static output made on first visit, so the 404 is the response's status", () => {
    expect(ensureStatic).toBe("navigation");
    // A sample no store page can be: an underscore never makes a slug.
    expect(generateStaticParams()).toEqual([{ rest: ["__sample__"] }]);
  });

  test("opts out of instant-navigation validation: it never renders", () => {
    expect(instant).toBe(false);
  });
});
