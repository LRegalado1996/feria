import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";

import {
  ProductSeoPreview,
  type ProductSeoPreviewProps,
} from "./product-seo-preview";

function setup({
  locale = "en",
  ...overrides
}: Partial<ProductSeoPreviewProps> & { locale?: Locale } = {}) {
  render(
    <ProductSeoPreview
      copy={DICTIONARIES[locale].articles.wizard.details.seo}
      description="Plata 925, hecho a mano."
      displayUrl="lrmarket.uy › productos › anillo-de-plata"
      pageTitle="Anillo de plata · LR Market"
      sharePhotoLeftOut={false}
      sharePhotoUrl="/seed/ring-2.jpg"
      sharePrice="$ 1.290"
      shareTitle="Anillo de plata"
      storeName="LR Market"
      {...overrides}
    />
  );

  return { google: within(screen.getByTestId("product-seo-preview-google")) };
}

describe("ProductSeoPreview", () => {
  test("shows the search result: the store, the address, the title and the description", () => {
    const { google } = setup();

    expect(screen.getByText("How it looks on Google")).toBeVisible();
    expect(
      [
        ...screen
          .getByTestId("product-seo-preview-google")
          .querySelectorAll("p"),
      ].map((line) => line.textContent)
    ).toEqual([
      "LR Market",
      "lrmarket.uy › productos › anillo-de-plata",
      "Anillo de plata · LR Market",
      "Plata 925, hecho a mano.",
    ]);
    expect(google.getByText("Anillo de plata · LR Market")).toBeVisible();
  });

  test("leaves the description out when the page has none", () => {
    setup({ description: undefined });

    expect(
      screen.getByTestId("product-seo-preview-google").querySelectorAll("p")
    ).toHaveLength(3);
  });

  test("shows the share card with the photo it draws", () => {
    setup();

    expect(
      screen.getByText("How it looks when the link is shared")
    ).toBeVisible();
    expect(screen.getByTestId("store-share-preview-photo")).toHaveStyle({
      backgroundImage: 'url("/seed/ring-2.jpg")',
    });
  });

  test.each([
    [true, true],
    [false, false],
  ])(
    "says the card leaves out a photo stored elsewhere only when it does (%s)",
    (leftOut, said) => {
      setup({ sharePhotoLeftOut: leftOut, sharePhotoUrl: null });

      expect(
        screen.queryByText(
          "For now the share card shows the photo only when it is stored on this site."
        ) !== null
      ).toBe(said);
    }
  );

  test("in Spanish, says it in Spanish", () => {
    setup({ locale: "es", sharePhotoLeftOut: true });

    expect(screen.getByText("Así se ve en Google")).toBeVisible();
    expect(
      screen.getByText(
        "Por ahora la tarjeta para compartir muestra la foto solo si está guardada en este sitio."
      )
    ).toBeVisible();
  });
});
