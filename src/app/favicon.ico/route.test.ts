import { describe, expect, test, vi } from "vitest";

import { GET } from "./route";

const favicon = new Response("ico", {
  headers: { "Content-Type": "image/x-icon" },
});

vi.mock("@/lib/brand/icons", () => ({
  renderFavicon: async () => await Promise.resolve(favicon),
}));

describe("GET /favicon.ico", () => {
  test("answers the brand's favicon", async () => {
    expect(await GET()).toBe(favicon);
  });
});
