import { describe, expect, test } from "vitest";

import UnknownPage, {
  ensureStatic,
  generateStaticParams,
  instant,
} from "./page";

describe("UnknownPage", () => {
  test("answers 404, which renders the store's own not-found page", () => {
    expect(() => {
      UnknownPage();
    }).toThrow(
      expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
    );
  });

  test("is static output made on first visit, so the 404 is the response's status", () => {
    expect(ensureStatic).toBe("navigation");
    // A sample no page can be: no address of the site has an underscore.
    expect(generateStaticParams()).toEqual([{ rest: ["__sample__"] }]);
  });

  test("opts out of instant-navigation validation: it never renders", () => {
    expect(instant).toBe(false);
  });
});
