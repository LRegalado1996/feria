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

  test("is static output, so the 404 is the response's status", () => {
    expect(ensureStatic).toBe("navigation");
  });

  test("prerenders the address the proxy sends every unknown one to, in three segments", () => {
    // No address of the site has an underscore, so no page can be it.
    expect(generateStaticParams()).toEqual([
      { rest: ["__unknown__", "__unknown__", "__unknown__"] },
    ]);
  });

  test("opts out of instant-navigation validation: it never renders", () => {
    expect(instant).toBe(false);
  });
});
