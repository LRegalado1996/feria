import { describe, expect, test } from "vitest";

import { BRAND_NAME, LOGO_BOX, LOGO_LETTERS, LOGO_VIEW_BOX } from "./logo";

describe("brand logo data", () => {
  test("the product is named LR Market", () => {
    expect(BRAND_NAME).toBe("LR Market");
  });

  test("the view box is the drawing's box", () => {
    expect(LOGO_BOX).toEqual({ height: 84, width: 116, x: 2, y: 8 });
    expect(LOGO_VIEW_BOX).toBe("2 8 116 84");
  });

  test("the full logo spells LR over MARKET and the mark keeps LR alone", () => {
    expect(LOGO_LETTERS.full.map((group) => group.glyphs.length)).toEqual([
      2, 6,
    ]);
    expect(LOGO_LETTERS.mark.map((group) => group.glyphs.length)).toEqual([2]);
    // The same two letters, placed differently.
    expect(LOGO_LETTERS.mark[0]?.glyphs).toBe(LOGO_LETTERS.full[0]?.glyphs);
    expect(LOGO_LETTERS.mark[0]?.transform).not.toBe(
      LOGO_LETTERS.full[0]?.transform
    );
  });
});
