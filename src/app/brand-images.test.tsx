import { describe, expect, test, vi } from "vitest";

import OpenGraphImage, * as openGraphImage from "./[locale]/opengraph-image";

// The renderer has its own tests; here it shows what each image asks of it.
vi.mock("@/lib/brand/logo-image", () => ({
  renderLogoImage: (options: unknown) => options,
}));

// The header's moss, the theme's contrast color.
const MOSS = "#262a1d";

describe("generated brand images", () => {
  test("the share card is the full logo on the contrast color, 1200 by 630 and described by the brand's name", () => {
    expect(openGraphImage.size).toEqual({ height: 630, width: 1200 });
    expect(openGraphImage.contentType).toBe("image/png");
    expect(openGraphImage.alt).toBe("LR Market");
    expect(OpenGraphImage()).toEqual({
      background: MOSS,
      colorway: "accent",
      height: 630,
      logoWidth: 580,
      variant: "full",
      width: 1200,
    });
  });
});
