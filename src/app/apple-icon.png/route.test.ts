import { describe, expect, test, vi } from "vitest";

import { GET } from "./route";

const renderHomeScreenIcon = vi.hoisted(() => vi.fn<() => Response>());

vi.mock("@/lib/brand/icons", () => ({ renderHomeScreenIcon }));

function setup() {
  const icon = new Response("home-screen icon");
  renderHomeScreenIcon.mockReturnValue(icon);

  return { icon };
}

describe("GET /apple-icon.png", () => {
  test("answers the home-screen icon", () => {
    const { icon } = setup();

    expect(GET()).toBe(icon);
    expect(renderHomeScreenIcon).toHaveBeenCalledExactlyOnceWith();
  });
});
