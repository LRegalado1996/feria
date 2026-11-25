import { describe, expect, test, vi } from "vitest";

import { GET } from "./route";

const renderTabIcon = vi.hoisted(() => vi.fn<(side: number) => Response>());

vi.mock("@/lib/brand/icons", () => ({
  renderTabIcon,
  TAB_ICON: { path: "/icon.png", side: 96 },
}));

function setup() {
  const icon = new Response("tab icon");
  renderTabIcon.mockReturnValue(icon);

  return { icon };
}

describe("GET /icon.png", () => {
  test("answers the tab icon at the tab icon's own size", () => {
    const { icon } = setup();

    expect(GET()).toBe(icon);
    expect(renderTabIcon).toHaveBeenCalledExactlyOnceWith(96);
  });
});
