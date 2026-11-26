import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { DICTIONARIES } from "@/test/i18n";

import { StoreNotFound } from "./store-not-found";

function setup() {
  const copy = DICTIONARIES.en.storefront.shell.notFound;
  render(
    <StoreNotFound
      catalogHref="/en/productos"
      className="custom"
      copy={copy}
      homeHref="/en"
    />
  );

  return { copy, page: screen.getByTestId("store-not-found") };
}

describe("StoreNotFound", () => {
  test("is the page's main landmark, headed by what happened under its 404 label", () => {
    const { page } = setup();

    expect(page.tagName).toBe("MAIN");
    expect(page).toHaveClass("custom");
    expect(
      within(page).getByRole("heading", {
        level: 1,
        name: "This page doesn't exist",
      })
    ).toHaveClass("font-display", "font-extrabold", "uppercase");
    expect(within(page).getByText("Error 404")).toBeVisible();
    expect(
      within(page).getByText(
        "The link may be old, or that article may no longer be for sale. Everything we have is still in the catalog."
      )
    ).toBeVisible();
  });

  test("sits on the lime, in ink, with no red anywhere: the store's own colors", () => {
    const { page } = setup();

    const block = page.querySelector("section");
    expect(block).toHaveClass("bg-store-accent", "text-store-foreground");
    expect(page.innerHTML).not.toContain("store-danger");
    // The label is an ink pill with lime words and a crossed search.
    const label = screen.getByTestId("store-not-found-label");
    expect(label).toHaveClass("bg-store-foreground", "text-store-accent");
    expect(label.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  test("says 404 in a large figure, hidden from a screen reader, which hears the label and the heading instead", () => {
    setup();

    const figure = screen.getByTestId("store-not-found-figure");
    expect(figure).toHaveTextContent(/^404$/u);
    expect(figure).toHaveAttribute("aria-hidden", "true");
    expect(figure).toHaveClass("font-display", "store-display-not-found");
    // The heading is the one level-one heading; the figure is no heading.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  test("leads first to the catalog, its one main action, then home", () => {
    setup();

    const catalog = screen.getByRole("link", { name: "See the catalog" });
    const home = screen.getByRole("link", { name: "Back to the store's home" });

    expect(catalog).toHaveAttribute("href", "/en/productos");
    // The ink pill with lime words, like "Add to cart", tall enough for a
    // thumb.
    expect(catalog).toHaveAttribute("data-variant", "primary");
    expect(catalog).toHaveAttribute("data-size", "lg");
    expect(home).toHaveAttribute("href", "/en");
    expect(home).toHaveAttribute("data-tone", "default");
    // In reading order the catalog comes first.
    expect(screen.getAllByRole("link")).toEqual([catalog, home]);
  });

  test("has no button, only its two links", () => {
    setup();

    expect(screen.queryByRole("button")).toBeNull();
  });
});
