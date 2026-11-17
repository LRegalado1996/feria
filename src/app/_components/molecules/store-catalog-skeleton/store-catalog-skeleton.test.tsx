import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithI18n } from "@/test/i18n";

import { StoreCatalogSkeleton } from "./store-catalog-skeleton";

function setup(locale: "en" | "es" = "es") {
  renderWithI18n(<StoreCatalogSkeleton />, { locale });
  const skeleton = screen.getByTestId("store-catalog-skeleton");

  return {
    part: (name: string) =>
      skeleton.querySelector(`[data-slot="store-catalog-skeleton-${name}"]`),
    skeleton,
  };
}

describe("StoreCatalogSkeleton", () => {
  test.each([
    ["es", "Cargando"],
    ["en", "Loading"],
  ] as const)("in %s, is busy and says %j", (locale, text) => {
    const { skeleton } = setup(locale);

    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveTextContent(new RegExp(`^${text}$`, "u"));
    expect(skeleton).toHaveAttribute("data-slot", "store-catalog-skeleton");
  });

  test("mirrors the page: a centered head, the bar, and two rows of four cards on a computer, each a square tile with a name and a price under it", () => {
    const { part } = setup();

    expect(part("head")).toHaveClass("items-center");
    expect(part("bar")).toHaveClass("justify-between");
    const grid = part("grid");
    expect(grid).toHaveClass("grid-cols-2", "md:grid-cols-4");
    // Each card's placeholders, top to bottom, all in the tile's grey.
    expect(
      [...(grid?.children ?? [])].map((card) =>
        [...card.children].map((placeholder) => placeholder.className)
      )
    ).toEqual(
      Array.from({ length: 8 }, () => [
        "aspect-square bg-store-surface",
        "mt-1 h-3 w-3/4 bg-store-surface",
        "h-3 w-1/3 bg-store-surface",
      ])
    );
  });
});
