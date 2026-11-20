import { describe, expect, test } from "vitest";

import { comingSoonAdminPath } from "./paths";

describe("comingSoonAdminPath", () => {
  test.each([
    ["es", "/admin/settings/coming-soon"],
    ["en", "/en/admin/settings/coming-soon"],
  ] as const)("in %s, is %s, under the settings", (locale, path) => {
    expect(comingSoonAdminPath(locale)).toBe(path);
  });
});
