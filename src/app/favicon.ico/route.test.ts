import { describe, expect, test, vi } from "vitest";

import { GET } from "./route";

const renderFavicon = vi.hoisted(() => vi.fn<() => Promise<Response>>());

vi.mock("@/lib/brand/icons", () => ({ renderFavicon }));

function setup() {
  const favicon = new Response("ico", {
    headers: { "Content-Type": "image/x-icon" },
  });
  renderFavicon.mockResolvedValue(favicon);

  return { favicon };
}

describe("GET /favicon.ico", () => {
  test("answers the brand's favicon", async () => {
    const { favicon } = setup();

    expect(await GET()).toBe(favicon);
    expect(renderFavicon).toHaveBeenCalledExactlyOnceWith();
  });
});
