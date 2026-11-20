import { describe, expect, test } from "vitest";

import { isCronRequest } from "./cron";

const SECRET = "a-cron-secret-of-32-characters!!";

describe("isCronRequest", () => {
  test.each([
    ["the bearer secret", `Bearer ${SECRET}`, true],
    ["no header", null, false],
    ["an empty header", "", false],
    ["the secret without its scheme", SECRET, false],
    ["another scheme", `Basic ${SECRET}`, false],
    ["the scheme in lower case", `bearer ${SECRET}`, false],
    ["the secret cut short", `Bearer ${SECRET.slice(0, -1)}`, false],
    ["the secret with one more character", `Bearer ${SECRET}!`, false],
    [
      "another secret of the same length",
      `Bearer ${"x".repeat(SECRET.length)}`,
      false,
    ],
    ["the bare scheme", "Bearer ", false],
  ])("%s is accepted: %s", (_case, header, accepted) => {
    expect(isCronRequest(header, SECRET)).toBe(accepted);
  });
});
