import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  LOGO_LETTERS,
  LOGO_TAG_PATH,
  type LogoVariant,
} from "@/lib/brand/logo";

import { StoreLogo, type StoreLogoProps } from "./store-logo";

/**
 * What each variant must draw after the tag: every letter of the drawing with
 * its group's placement and its own. The drawing itself is pinned to the
 * approved artwork in `src/lib/brand/logo.test.ts`.
 */
function expectedLetters(variant: LogoVariant) {
  return LOGO_LETTERS[variant].flatMap((group) =>
    group.glyphs.map((glyph) => ({
      d: glyph.d,
      group: group.transform,
      transform: glyph.transform ?? null,
    }))
  );
}

function setup(props: StoreLogoProps = {}) {
  render(<StoreLogo {...props} />);

  const logo = screen.getByRole("img", { name: "LR Market" });
  const slot = (name: string) => logo.querySelector(`[data-slot="${name}"]`);

  return {
    letters: slot("store-logo-letters"),
    logo,
    drawnLetters: [...logo.querySelectorAll("g > g > path")].map((path) => ({
      d: path.getAttribute("d"),
      group: path.parentElement?.getAttribute("transform"),
      transform: path.getAttribute("transform"),
    })),
    paths: [...logo.querySelectorAll("path")],
    tag: slot("store-logo-tag"),
  };
}

describe("StoreLogo", () => {
  test("is an image named after the brand: the tag on the accent, the monogram and the name in the foreground", () => {
    const { drawnLetters, letters, logo, paths, tag } = setup();

    expect(logo.tagName).toBe("svg");
    expect(logo).toHaveAttribute("data-slot", "store-logo");
    expect(logo).toHaveAttribute("data-tone", "accent");
    expect(logo).toHaveAttribute("data-variant", "full");
    expect(logo).toHaveAttribute("viewBox", "2 8 116 84");
    expect(tag).toHaveAttribute("d", LOGO_TAG_PATH);
    expect(tag).toHaveClass("fill-store-accent");
    expect(letters).toHaveClass("fill-store-foreground");
    // The tag, then L, R and the six letters of MARKET, each in its place.
    expect(paths).toHaveLength(9);
    expect(drawnLetters).toEqual(expectedLetters("full"));
    expect(drawnLetters).toHaveLength(8);
  });

  test("the mark keeps the tag and the monogram, larger, and drops the name", () => {
    const { drawnLetters, letters, logo, paths } = setup({ variant: "mark" });

    expect(logo).toHaveAttribute("data-variant", "mark");
    expect(paths).toHaveLength(3);
    expect(drawnLetters).toEqual(expectedLetters("mark"));
    expect(drawnLetters).toHaveLength(2);
    expect(letters?.firstElementChild).toHaveAttribute(
      "transform",
      "translate(42.6 19) scale(.62)"
    );
  });

  test("the contrast tone puts the accent letters on a contrast tag", () => {
    const { letters, logo, tag } = setup({ tone: "contrast" });

    expect(logo).toHaveAttribute("data-tone", "contrast");
    expect(tag).toHaveClass("fill-store-contrast");
    expect(tag).not.toHaveClass("fill-store-accent");
    expect(letters).toHaveClass("fill-store-accent");
    expect(letters).not.toHaveClass("fill-store-foreground");
  });

  test("a caller's height replaces the default one and keeps the proportions", () => {
    const { logo } = setup({ className: "h-12" });

    expect(logo).toHaveClass("h-12", "w-auto", "block");
    expect(logo).not.toHaveClass("h-24");
  });
});
