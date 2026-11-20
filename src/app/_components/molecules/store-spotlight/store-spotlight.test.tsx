import { readFileSync } from "node:fs";
import path from "node:path";

import { screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import { StoreSpotlight, type StoreSpotlightProps } from "./store-spotlight";

function makeArticle(
  overrides: Partial<StoreSpotlightProps["article"]> = {}
): StoreSpotlightProps["article"] {
  return {
    cover: {
      alt: "Yellow fish-shaped bubble gun",
      url: "/seed/bubble-gun-2.jpg",
    },
    currencyCode: "UYU",
    id: 6,
    lang: "en",
    priceAmount: 79_000,
    title: "Fish bubble gun",
    ...overrides,
  };
}

function setup({
  article = makeArticle(),
  headingLevel,
  label = { lang: "en", text: "New" },
  locale = "en",
  phrase = { lang: "es", text: "El que más piden." },
}: {
  article?: StoreSpotlightProps["article"];
  headingLevel?: "h2" | "h3";
  label?: StoreSpotlightProps["label"];
  locale?: Locale;
  phrase?: StoreSpotlightProps["phrase"];
} = {}) {
  renderWithI18n(
    <StoreSpotlight
      article={article}
      className="custom"
      copy={DICTIONARIES[locale].storefront}
      headingLevel={headingLevel}
      href="/en/productos/burbujero-pez"
      id={51}
      label={label}
      locale={locale}
      phrase={phrase}
    />,
    { locale }
  );
  const block = screen.getByRole("region", { name: article.title });

  return { block, within: within(block) };
}

describe("StoreSpotlight", () => {
  test("is a region named by the article: its name an h2 that is the one link to it, marked with its language", () => {
    const { block, within: inside } = setup();

    expect(block).toHaveAttribute("data-slot", "store-spotlight");
    expect(block).toHaveClass("custom", "bg-store-contrast");
    const heading = inside.getByRole("heading", {
      level: 2,
      name: "Fish bubble gun",
    });
    const link = within(heading).getByRole("link", { name: "Fish bubble gun" });
    expect(link).toHaveAttribute("href", "/en/productos/burbujero-pez");
    expect(link).toHaveAttribute("lang", "en");
    // The block's one link: the photo and the words lead there through it.
    expect(inside.getAllByRole("link")).toEqual([link]);
  });

  test("shows the photo lazily on its square tile, the price, the pill and the phrase, each word in its language", () => {
    const { block, within: inside } = setup();

    const photo = inside.getByRole("img", {
      name: "Yellow fish-shaped bubble gun",
    });
    expect(photo).toHaveAttribute("loading", "lazy");
    expect(photo.closest('[data-slot="store-spotlight-tile"]')).toHaveClass(
      "aspect-square"
    );
    expect(inside.getByText("New")).toHaveAttribute("lang", "en");
    expect(inside.getByText("El que más piden.")).toHaveAttribute("lang", "es");
    // The price in white on the moss.
    const price = block.querySelector('[data-slot="store-price-tag"]');
    // The matcher reads its no-break space as a space.
    expect(price).toHaveTextContent("UYU 790");
    expect(price).toHaveClass("text-store-background");
  });

  test("its button adds the article and is not inside the link", () => {
    const { within: inside } = setup();

    const button = inside.getByRole("button", {
      name: "Add to cart: Fish bubble gun",
    });
    expect(button.closest("a")).toBeNull();
    expect(button).toHaveTextContent("Add to cart");
  });

  test("with no label and no phrase, shows neither", () => {
    const { block } = setup({ label: null, phrase: null });

    expect(
      block.querySelector('[data-slot="store-spotlight-label"]')
    ).toBeNull();
    expect(
      block.querySelector('[data-slot="store-spotlight-phrase"]')
    ).toBeNull();
  });

  test("an article with no photo shows the tile's placeholder", () => {
    const { within: inside } = setup({ article: makeArticle({ cover: null }) });

    expect(inside.queryByRole("img")).toBeNull();
    expect(inside.getByText("No photo")).toBeVisible();
  });

  test("takes the heading level of the page's outline", () => {
    const { within: inside } = setup({ headingLevel: "h3" });

    expect(
      inside.getByRole("heading", { level: 3, name: "Fish bubble gun" })
    ).toBeVisible();
  });

  test("lays itself out by its own width, not the window's, so a narrow preview on a computer draws it as a phone does", () => {
    const { block, within: inside } = setup();

    expect(block).toHaveClass("@container");
    expect(block.firstElementChild).toHaveClass("grid", "@3xl:grid-cols-2");
    // One breakpoint of the window's left inside would split a narrow
    // preview in two columns again.
    for (const element of [block, ...block.querySelectorAll("*")]) {
      expect(element.getAttribute("class") ?? "").not.toMatch(
        /(?:^|\s)(?:sm|md|lg|xl):/u
      );
    }
    // The name is sized to the column it sits in.
    const heading = inside.getByRole("heading", { name: "Fish bubble gun" });
    expect(heading).toHaveClass("store-display-spotlight");
    expect(heading.parentElement).toHaveAttribute(
      "data-slot",
      "store-spotlight-words"
    );
    expect(heading.parentElement).toHaveClass("@container");
  });

  test("its name's size follows its column and stops at 64 px, so a ten-letter word never breaks mid-word in a narrow one", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/styles/globals.css"),
      "utf-8"
    );
    const size =
      /@utility store-display-spotlight \{\s*font-size: ([^;]+);/u.exec(
        css
      )?.[1];

    expect(size).toBe("clamp(1.25rem, 10cqi, 4rem)");
  });

  test("speaks Spanish on a Spanish page", () => {
    const { within: inside } = setup({ locale: "es" });

    expect(
      inside.getByRole("button", {
        name: "Agregar al carrito: Fish bubble gun",
      })
    ).toBeVisible();
  });
});
