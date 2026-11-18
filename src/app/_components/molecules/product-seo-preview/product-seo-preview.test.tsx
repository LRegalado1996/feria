import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";

import {
  ProductSeoPreview,
  type ProductSeoPreviewProps,
} from "./product-seo-preview";

const BLOB_PHOTO =
  "https://store.public.blob.vercel-storage.com/local/product/11111111-1111-4111-8111-111111111111.webp";

function setup({
  locale = "en",
  ...overrides
}: Partial<ProductSeoPreviewProps> & { locale?: Locale } = {}) {
  render(
    <ProductSeoPreview
      copy={DICTIONARIES[locale].articles.wizard.details.seo}
      currency="UYU"
      description={"  Plata 925,\n\nhecho a mano. "}
      host="lrmarket.uy"
      lang="es"
      locale={locale}
      mainPhotoUrl="/seed/ring-2.jpg"
      price={1290}
      slug="anillo-de-plata"
      store={{ name: "LR Market", tagline: "Bijouterie en la feria." }}
      title=" Anillo de plata "
      {...overrides}
    />
  );

  return {
    googleLines: () =>
      [
        ...screen
          .getByTestId("product-seo-preview-google")
          .querySelectorAll("p"),
      ].map((line) => line.textContent),
  };
}

describe("ProductSeoPreview", () => {
  test("writes the search result from the title and the description: the store, the address, the title, the description", () => {
    const { googleLines } = setup();

    expect(screen.getByText("How it looks on Google")).toBeVisible();
    expect(screen.getByTestId("product-seo-preview-google")).toHaveAttribute(
      "lang",
      "es"
    );
    expect(googleLines()).toEqual([
      "LR Market",
      "lrmarket.uy › productos › anillo-de-plata",
      "Anillo de plata · LR Market",
      "Plata 925, hecho a mano.",
    ]);
  });

  test("describes an article without a description by the store's tagline, and one with no address yet by an ellipsis", () => {
    const { googleLines } = setup({ description: " ", slug: null });

    expect(googleLines()).toEqual([
      "LR Market",
      "lrmarket.uy › productos › …",
      "Anillo de plata · LR Market",
      "Bijouterie en la feria.",
    ]);
  });

  test("leaves the description out when neither the article nor the store has one", () => {
    const { googleLines } = setup({
      description: "",
      store: { name: "LR Market", tagline: undefined },
    });

    expect(googleLines()).toEqual([
      "LR Market",
      "lrmarket.uy › productos › anillo-de-plata",
      "Anillo de plata · LR Market",
    ]);
  });

  test("draws the share card with the title, the price in the page's language and a photo stored on this site", () => {
    setup();

    expect(
      screen.getByText("How it looks when the link is shared")
    ).toBeVisible();
    expect(screen.getByTestId("store-share-preview")).toHaveTextContent(
      "LR MarketAnillo de plataUYU 1,290"
    );
    expect(screen.getByTestId("store-share-preview-photo")).toHaveStyle({
      backgroundImage: 'url("/seed/ring-2.jpg")',
    });
    expect(
      screen.queryByText(/For now the share card shows the photo only/u)
    ).not.toBeInTheDocument();
  });

  test("draws an untitled article without a price, and no photo", () => {
    const { googleLines } = setup({
      mainPhotoUrl: null,
      price: null,
      title: "",
    });

    expect(googleLines()[2]).toBe("… · LR Market");

    expect(screen.getByTestId("store-share-preview")).toHaveTextContent(
      "LR Market…"
    );
    expect(
      screen.getByTestId("store-share-preview-photo").style.backgroundImage
    ).toBe("");
    expect(
      screen.queryByText(/For now the share card shows the photo only/u)
    ).not.toBeInTheDocument();
  });

  test("says the card leaves out a main photo stored elsewhere", () => {
    setup({ mainPhotoUrl: BLOB_PHOTO });

    expect(
      screen.getByTestId("store-share-preview-photo").style.backgroundImage
    ).toBe("");
    expect(
      screen.getByText(
        "For now the share card shows the photo only when it is stored on this site."
      )
    ).toBeVisible();
  });

  test("in Spanish, says it in Spanish", () => {
    setup({ locale: "es", mainPhotoUrl: BLOB_PHOTO });

    expect(screen.getByText("Así se ve en Google")).toBeVisible();
    expect(screen.getByTestId("store-share-preview")).toHaveTextContent(
      "$ 1.290"
    );
    expect(
      screen.getByText(
        "Por ahora la tarjeta para compartir muestra la foto solo si está guardada en este sitio."
      )
    ).toBeVisible();
  });
});
