import { describe, expect, test } from "vitest";

import { SOCIAL_LINKS } from "./social";

describe("SOCIAL_LINKS", () => {
  test("lead to the lrmarket profiles, over HTTPS", () => {
    expect(SOCIAL_LINKS).toEqual({
      instagram: "https://www.instagram.com/lrmarket",
      tiktok: "https://www.tiktok.com/@lrmarket",
    });
  });
});
