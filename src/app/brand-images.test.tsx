import { describe, expect, test, vi } from "vitest";

import OpenGraphImage, * as openGraphImage from "./[locale]/opengraph-image";
import AppleIcon, * as appleIcon from "./apple-icon";
import Icon, * as icon from "./icon";

// The renderer has its own tests; here it shows what each image asks of it.
vi.mock("@/lib/brand/logo-image", () => ({
  renderLogoImage: (options: unknown) => options,
}));

const INK = "#111312";

describe("generated brand images", () => {
  test("the tab icon is the mark alone, edge to edge on a transparent 32 px square", () => {
    expect(icon.size).toEqual({ height: 32, width: 32 });
    expect(icon.contentType).toBe("image/png");
    expect(Icon()).toEqual({
      background: null,
      colorway: "accent",
      height: 32,
      logoWidth: 32,
      variant: "mark",
      width: 32,
    });
  });

  test("the home-screen icon is the mark with a margin on an opaque 180 px square", () => {
    expect(appleIcon.size).toEqual({ height: 180, width: 180 });
    expect(appleIcon.contentType).toBe("image/png");
    expect(AppleIcon()).toEqual({
      background: INK,
      colorway: "accent",
      height: 180,
      logoWidth: 132,
      variant: "mark",
      width: 180,
    });
  });

  test("the share card is the full logo on the contrast color, 1200 by 630 and described by the brand's name", () => {
    expect(openGraphImage.size).toEqual({ height: 630, width: 1200 });
    expect(openGraphImage.contentType).toBe("image/png");
    expect(openGraphImage.alt).toBe("LR Market");
    expect(OpenGraphImage()).toEqual({
      background: INK,
      colorway: "accent",
      height: 630,
      logoWidth: 580,
      variant: "full",
      width: 1200,
    });
  });
});
