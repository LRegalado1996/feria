import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";

import { StoreHowToBuy, type StoreHowToBuyProps } from "./store-how-to-buy";

function setup({
  headingLevel,
  locale = "en",
}: {
  headingLevel?: StoreHowToBuyProps["headingLevel"];
  locale?: Locale;
} = {}) {
  render(
    <StoreHowToBuy
      className="custom"
      copy={DICTIONARIES[locale].storefront}
      headingLevel={headingLevel}
    />
  );
  const block = screen.getByRole("region");
  const stepsList = within(block).getByRole("list");

  return {
    block,
    /** Each step as a screen reader hears it: its name, then its line. */
    steps: within(stepsList)
      .getAllByRole("listitem")
      .map((step) => [...step.querySelectorAll("p")].map((p) => p.textContent)),
    stepsList,
  };
}

describe("StoreHowToBuy", () => {
  test("is a section named by a title for a screen reader only, at the level given", () => {
    const { block } = setup({ headingLevel: "h3" });

    expect(block).toHaveAccessibleName("How to buy");
    const heading = within(block).getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("How to buy");
    // The circles say it to the eye (FER-086).
    expect(heading).toHaveClass("sr-only");
  });

  test("its title is an h2 unless told otherwise", () => {
    const { block } = setup();

    expect(within(block).getByRole("heading", { level: 2 })).toHaveTextContent(
      "How to buy"
    );
  });

  test("is a light band of its own, apart from the page's background, with no hairlines", () => {
    const { block } = setup();

    expect(block).toHaveClass("bg-store-surface", "custom");
    expect(block).not.toHaveClass("bg-store-background", "border-y");
  });

  test("lists the four steps in the order they happen, paying last, as an ordered list", () => {
    const { steps, stepsList } = setup();

    expect(stepsList.tagName).toBe("OL");
    expect(steps).toEqual([
      ["Choose", "Browse the catalog on the site."],
      ["Add to cart", "Leave your name and mobile."],
      ["We deliver it", "At the stall, or we send it."],
      ["Pay your way", "We take every way to pay."],
    ]);
  });

  test("draws each step's icon in a circle for the eye only, with no figure: the list already says its place", () => {
    const { stepsList } = setup();

    const circles = [
      ...stepsList.querySelectorAll('li > [aria-hidden="true"]'),
    ];
    expect(circles).toHaveLength(4);
    for (const circle of circles) {
      expect(circle).toHaveClass("rounded-full");
      expect(circle.querySelector("svg")).not.toBeNull();
      expect(circle).toHaveTextContent("");
    }
  });

  test("leads nowhere: the steps are the whole block", () => {
    const { block } = setup();

    expect(within(block).queryByRole("link")).toBeNull();
  });

  test("stacks its steps, then two by two, then four in a row as wide as their words, by the block's own width, never the window's", () => {
    const { stepsList } = setup();

    expect(stepsList).toHaveClass(
      "grid",
      "@3xl:grid-cols-2",
      "@6xl:grid-cols-[repeat(4,auto)]",
      "@6xl:justify-between"
    );
    expect(stepsList.className).not.toMatch(/(?:^|\s)(?:sm|md|lg|xl):/u);
  });

  test("says everything in Spanish on a Spanish page", () => {
    const { block, steps } = setup({ locale: "es" });

    expect(block).toHaveAccessibleName("Cómo comprar");
    expect(steps).toEqual([
      ["Elegí", "Mirá el catálogo en la web."],
      ["Agregá al carrito", "Dejá tu nombre y tu celular."],
      ["Te lo entregamos", "En el puesto o te lo mandamos."],
      ["Pagá como quieras", "Aceptamos todos los medios de pago."],
    ]);
  });
});
