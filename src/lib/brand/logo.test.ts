import { describe, expect, test } from "vitest";

import { BRAND_NAME, LOGO_BOX, LOGO_LETTERS, LOGO_VIEW_BOX } from "./logo";

// The approved artwork's two monogram letters, as Lucas delivered them.
const L = "M12 14H28V70H50V86H12Z";
const R =
  "M57 14H80A15 15 0 0 1 95 29V43A15 15 0 0 1 86 56.8L97 86H80L72 62V86H57ZM72 29V45H77A3 3 0 0 0 80 42V32A3 3 0 0 0 77 29Z";

describe("brand logo data", () => {
  test("the product is named LR Market", () => {
    expect(BRAND_NAME).toBe("LR Market");
  });

  test("the view box is the drawing's box", () => {
    expect(LOGO_BOX).toEqual({ height: 84, width: 116, x: 2, y: 8 });
    expect(LOGO_VIEW_BOX).toBe("2 8 116 84");
  });

  test("the monogram is an L, then an R", () => {
    expect(LOGO_LETTERS.mark).toEqual([
      {
        glyphs: [{ d: L }, { d: R }],
        transform: "translate(42.6 19) scale(.62)",
      },
    ]);
  });

  test("the full logo sets the same monogram higher and smaller, over M, A, R, K, E, T from left to right", () => {
    expect(LOGO_LETTERS.full).toEqual([
      {
        glyphs: [{ d: L }, { d: R }],
        transform: "translate(44.04 11.38) scale(.58)",
      },
      {
        glyphs: [
          { d: "M0 0H24L39 52L54 0H78V100H57V42L46 82H32L21 42V100H0Z" },
          {
            d: "M21 0H45L66 100H44L41 80H25L22 100H0ZM28 61H38L33 27Z",
            transform: "translate(87 0)",
          },
          { d: R, transform: "translate(76.5 -19.44) scale(1.5 1.389)" },
          {
            d: "M0 0H22V38L40 0H64L42 44L64 100H40L27 64L22 73V100H0Z",
            transform: "translate(231 0)",
          },
          {
            d: "M0 0H50V20H22V39H44V58H22V80H50V100H0Z",
            transform: "translate(304 0)",
          },
          { d: "M0 0H54V21H38V100H16V21H0Z", transform: "translate(363 0)" },
        ],
        transform: "translate(51 66.8) scale(.11823 .135)",
      },
    ]);
  });
});
