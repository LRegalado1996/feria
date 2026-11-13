import { describe, expect, test } from "vitest";

import { getGravatarUrl } from "./get-gravatar-url";

// SHA-256 of "test@example.com", written out so the test does not re-derive
// it with the implementation's own algorithm.
const HASH = "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b";

describe("getGravatarUrl", () => {
  test.each([
    ["the address as it is", "test@example.com"],
    ["a mixed-case address, lowercased", "Test@Example.COM"],
    ["an address with surrounding whitespace, trimmed", "  test@example.com\n"],
  ])("hashes %s, at 80px with d=404", (_case, email) => {
    expect(getGravatarUrl(email)).toBe(
      `https://gravatar.com/avatar/${HASH}?d=404&s=80`
    );
  });

  test("asks for the size it is given", () => {
    expect(getGravatarUrl("test@example.com", 200)).toBe(
      `https://gravatar.com/avatar/${HASH}?d=404&s=200`
    );
  });
});
