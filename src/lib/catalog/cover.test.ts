import { expect, test } from "vitest";

import { coverOf, imageOf } from "./cover";

const COMPUTER = { height: 800, url: "/seed/ring-2.jpg", width: 1200 };
const PHONE = { height: 1200, url: "/seed/ring-1.jpg", width: 1200 };

test.each([
  ["/seed/a.jpg", 1200, 800, { height: 800, url: "/seed/a.jpg", width: 1200 }],
  [null, null, null, null],
  ["/seed/a.jpg", null, 800, null],
  ["/seed/a.jpg", 1200, null, null],
  [null, 1200, 800, null],
])("reads %s %s×%s as %j", (url, width, height, expected) => {
  expect(imageOf(url, width, height)).toEqual(expected);
});

test("a cover is its images and its own alt text", () => {
  expect(
    coverOf({ computer: COMPUTER, phone: PHONE }, "Anillos dorados", "Anillos")
  ).toEqual({ alt: "Anillos dorados", computer: COMPUTER, phone: PHONE });
});

test.each([null, "", "   "])(
  "an alt text of %j falls back to the page's name",
  (alt) => {
    expect(
      coverOf({ computer: COMPUTER, phone: null }, alt, "Anillos")
    ).toEqual({ alt: "Anillos", computer: COMPUTER, phone: null });
  }
);

test("without a computer image there is no cover, even with a phone one", () => {
  expect(
    coverOf({ computer: null, phone: PHONE }, "Anillos", "Anillos")
  ).toBeNull();
});
