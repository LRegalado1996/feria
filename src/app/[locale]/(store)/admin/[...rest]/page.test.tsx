import { describe, expect, test } from "vitest";

import UnknownAdminPage, {
  ensureStatic,
  generateStaticParams,
  instant,
} from "./page";

describe("UnknownAdminPage", () => {
  test("answers 404, which renders the store's own not-found page", () => {
    expect(() => {
      UnknownAdminPage();
    }).toThrow(
      expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
    );
  });

  test("is static output made on first visit, so the 404 is the response's status", () => {
    expect(ensureStatic).toBe("navigation");
    expect(generateStaticParams()).toEqual([{ rest: ["__sample__"] }]);
  });

  test("opts out of instant-navigation validation: it never renders", () => {
    expect(instant).toBe(false);
  });
});
