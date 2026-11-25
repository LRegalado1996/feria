import { describe, expect, test, vi } from "vitest";

import {
  FAVICON,
  HOME_SCREEN_ICON,
  renderFavicon,
  renderHomeScreenIcon,
  renderTabIcon,
  SITE_ICONS,
  TAB_ICON,
} from "./icons";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

// The renderer has its own tests; here it shows what each icon asks of it,
// and answers a PNG's bytes the way an `ImageResponse` does.
vi.mock("./logo-image", () => ({
  renderLogoImage: (options: unknown) => ({
    arrayBuffer: async () => await Promise.resolve(new Uint8Array(PNG).buffer),
    options,
  }),
}));

// The header's moss, the theme's contrast color.
const MOSS = "#262a1d";

describe("icon addresses", () => {
  test.each([
    ["the favicon", FAVICON, "/favicon.ico", 48],
    ["the tab icon", TAB_ICON, "/icon.png", 96],
    ["the home-screen icon", HOME_SCREEN_ICON, "/apple-icon.png", 180],
  ])("%s sits at %s, %i px a side", (_name, icon, path, side) => {
    expect(icon).toEqual({ path, side });
  });

  test.each([FAVICON, TAB_ICON])(
    "the browser icon at $path is a multiple of 48 px, as Google asks",
    ({ side }) => {
      expect(side % 48).toBe(0);
    }
  );
});

describe("renderTabIcon", () => {
  test("draws the mark alone, edge to edge on a transparent square of the side asked for", () => {
    expect(renderTabIcon(96)).toMatchObject({
      options: {
        background: null,
        colorway: "accent",
        height: 96,
        logoWidth: 96,
        variant: "mark",
        width: 96,
      },
    });
  });
});

describe("renderHomeScreenIcon", () => {
  test("draws the mark with a margin on an opaque 180 px square of moss", () => {
    expect(renderHomeScreenIcon()).toMatchObject({
      options: {
        background: MOSS,
        colorway: "accent",
        height: 180,
        logoWidth: 132,
        variant: "mark",
        width: 180,
      },
    });
  });
});

describe("renderFavicon", () => {
  test("answers the 48 px tab icon's PNG inside an ICO file, typed as one", async () => {
    const response = await renderFavicon();
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.headers.get("content-type")).toBe("image/x-icon");
    // The directory entry's side, then the PNG after the 22-byte header.
    expect([body[6], body[7]]).toEqual([48, 48]);
    expect(body.subarray(22)).toEqual(PNG);
  });
});

describe("SITE_ICONS", () => {
  test("declares the favicon and the tab icon for browsers and the home-screen icon for phones, each by its fixed address and size", () => {
    expect(SITE_ICONS).toEqual({
      apple: [{ sizes: "180x180", type: "image/png", url: "/apple-icon.png" }],
      icon: [
        { sizes: "48x48", type: "image/x-icon", url: "/favicon.ico" },
        { sizes: "96x96", type: "image/png", url: "/icon.png" },
      ],
    });
  });
});
