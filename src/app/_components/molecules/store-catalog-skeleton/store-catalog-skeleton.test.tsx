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

  test("mirrors the page: a centered head, the bar, and two rows of four square tiles on a computer", () => {
    const { part } = setup();

    expect(part("head")).toHaveClass("items-center");
    expect(part("bar")).toHaveClass("justify-between");
    const grid = part("grid");
    expect(grid).toHaveClass("grid-cols-2", "md:grid-cols-4");
    expect(grid?.children).toHaveLength(8);
    expect(grid?.querySelectorAll(".aspect-square")).toHaveLength(8);
  });
});
