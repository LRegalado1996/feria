import { screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { ProductPublishSuccess } from "./product-publish-success";

function setup({ locale = "en" }: { locale?: Locale } = {}) {
  const headingRef = createRef<HTMLHeadingElement>();
  renderWithI18n(
    <ProductPublishSuccess
      articlePath="/en/productos/anillo-de-plata"
      headingRef={headingRef}
      listHref="/en/admin/products"
      newHref="/en/admin/products/new"
      title="Anillo de plata"
    />,
    { locale }
  );

  return { headingRef };
}

describe("ProductPublishSuccess", () => {
  test("says the article is in the store, its heading a focus target", () => {
    const { headingRef } = setup();

    const heading = screen.getByRole("heading", { name: "Published!" });
    expect(headingRef.current).toBe(heading);
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(
      screen.getByRole("region", { name: "Published!" })
    ).toHaveTextContent("“Anillo de plata” is in the store now.");
  });

  test("leads to the store in a new tab, to a new article and to the list", () => {
    setup();

    const store = screen.getByRole("link", { name: "View in the store" });
    expect(store).toHaveAttribute("href", "/en/productos/anillo-de-plata");
    expect(store).toHaveAttribute("target", "_blank");
    expect(store).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByRole("link", { name: "Load another" })).toHaveAttribute(
      "href",
      "/en/admin/products/new"
    );
    expect(
      screen.getByRole("link", { name: "Go to articles" })
    ).toHaveAttribute("href", "/en/admin/products");
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
  });

  test("pops a ring of twelve pieces of confetti, each its own way, hidden from the ear", () => {
    setup();

    const pieces = [
      ...screen
        .getByTestId("product-publish-success")
        .querySelectorAll<HTMLElement>("[aria-hidden] > span.absolute"),
    ];
    expect(
      pieces.map((piece) =>
        piece.style.getPropertyValue("--wizard-confetti-angle")
      )
    ).toEqual([
      "0deg",
      "30deg",
      "60deg",
      "90deg",
      "120deg",
      "150deg",
      "180deg",
      "210deg",
      "240deg",
      "270deg",
      "300deg",
      "330deg",
    ]);
    expect(
      pieces.every((piece) => piece.className.includes("motion-safe:"))
    ).toBe(true);
  });

  test("in Spanish, says it in Spanish", () => {
    setup({ locale: "es" });

    expect(screen.getByRole("heading", { name: "¡Publicado!" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Cargar otro" })).toBeVisible();
  });
});
