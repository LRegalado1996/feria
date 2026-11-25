import { describe, expect, test, vi } from "vitest";

import { GET } from "./route";

const icon = new Response("home-screen icon");

vi.mock("@/lib/brand/icons", () => ({
  renderHomeScreenIcon: () => icon,
}));

describe("GET /apple-icon.png", () => {
  test("answers the home-screen icon", () => {
    expect(GET()).toBe(icon);
  });
});
