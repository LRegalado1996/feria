import { describe, expect, test, vi } from "vitest";

import { GET } from "./route";

const renderTabIcon = vi.hoisted(() =>
  vi.fn((side: number) => new Response(`tab icon ${side}`))
);

vi.mock("@/lib/brand/icons", () => ({
  renderTabIcon,
  TAB_ICON: { path: "/icon.png", side: 96 },
}));

describe("GET /icon.png", () => {
  test("answers the tab icon at the tab icon's own size", async () => {
    const response = GET();

    expect(renderTabIcon).toHaveBeenCalledExactlyOnceWith(96);
    expect(await response.text()).toBe("tab icon 96");
  });
});
