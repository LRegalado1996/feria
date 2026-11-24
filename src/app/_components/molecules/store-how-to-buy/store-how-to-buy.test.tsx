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
      href="/en/productos"
    />
  );
  const block = screen.getByRole("region");
  const [steps, payments] = within(block).getAllByRole("list");

  return {
    block,
    /** Each step as a screen reader hears it: its name, then its line. */
    steps: within(steps as HTMLElement)
      .getAllByRole("listitem")
      .map((step) => [...step.querySelectorAll("p")].map((p) => p.textContent)),
    stepsList: steps as HTMLElement,
    payments: payments as HTMLElement,
  };
}

describe("StoreHowToBuy", () => {
  test("is a section named by its title, which takes the level given", () => {
    const { block } = setup({ headingLevel: "h3" });

    expect(block).toHaveAccessibleName("Buy in 3 steps");
    expect(within(block).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Buy in 3 steps"
    );
    expect(block).toHaveClass("bg-store-contrast", "custom");
  });

  test("its title is an h2 unless told otherwise", () => {
    const { block } = setup();

    expect(within(block).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Buy in 3 steps"
    );
  });

  test("lists the three steps in the order they happen, as an ordered list", () => {
    const { steps, stepsList } = setup();

    expect(stepsList.tagName).toBe("OL");
    expect(steps).toEqual([
      ["Choose", "Browse the catalog on the site."],
      ["Add to cart", "Leave your name and your mobile number."],
      ["We arrange delivery", "Pick it up at the stall or we send it to you."],
    ]);
  });

  test("draws each step's figure for the eye only: the list already says its place", () => {
    const { stepsList } = setup();

    expect(
      [...stepsList.querySelectorAll('[aria-hidden="true"]')].map(
        (figure) => figure.textContent
      )
    ).toEqual(["01", "02", "03"]);
  });

  test("says how to pay as a list named by its title", () => {
    const { payments } = setup();

    expect(payments).toHaveAccessibleName("Pay with");
    expect(
      within(payments)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "Cash",
      "Credit and debit cards",
      "Mercado Pago",
      "Bank transfer",
    ]);
  });

  test("leads to the catalog with the address it was given", () => {
    const { block } = setup();

    expect(
      within(block).getByRole("link", { name: "See the catalog" })
    ).toHaveAttribute("href", "/en/productos");
  });

  test("stacks its steps until the block itself is wide, never by the window's width", () => {
    const { stepsList } = setup();

    expect(stepsList).toHaveClass("grid", "@3xl:grid-cols-3");
    expect(stepsList.className).not.toMatch(/(?:^|\s)(?:sm|md|lg|xl):/u);
  });

  test("says everything in Spanish on a Spanish page", () => {
    const { block, payments, steps } = setup({ locale: "es" });

    expect(block).toHaveAccessibleName("Comprá en 3 pasos");
    expect(steps).toEqual([
      ["Elegí", "Mirá el catálogo en la web."],
      ["Agregá al carrito", "Dejá tu nombre y tu celular."],
      ["Coordinamos la entrega", "Retirás en el puesto o te lo mandamos."],
    ]);
    expect(payments).toHaveAccessibleName("Pagás con");
    expect(
      within(payments)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "Efectivo",
      "Tarjetas de crédito y débito",
      "Mercado Pago",
      "Transferencia bancaria",
    ]);
    expect(
      within(block).getByRole("link", { name: "Ver el catálogo" })
    ).toHaveAttribute("href", "/en/productos");
  });
});
