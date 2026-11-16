import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { DICTIONARIES } from "@/test/i18n";

import {
  StoreArticleCard,
  type StoreArticleCardProps,
} from "./store-article-card";

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// Intl separates a currency from its amount with a no-break space.
const NBSP = " ";

const PHOTO = { alt: "A pearl necklace on a stand", src: "/pearl.jpg" };

/** The card, its words those of the page's language unless given. */
function setup(props: Partial<StoreArticleCardProps> = {}) {
  const locale = props.locale ?? "en";
  render(
    <StoreArticleCard
      labels={{
        card: DICTIONARIES[locale].storefront.articleCard,
        price: DICTIONARIES[locale].storefront.price,
      }}
      amount={89_000}
      currency="UYU"
      href="/en/products/pearl-necklace"
      image={null}
      locale="en"
      name="Pearl necklace"
      {...props}
    />
  );
  const card = screen.getByRole("article");

  return {
    badge: card.querySelector('[data-slot="store-badge"]'),
    card,
    heading: within(card).getByRole("heading"),
    link: within(card).getByRole("link"),
    price: card.querySelector('[data-slot="store-price-tag"]'),
    soldOut: card.querySelector('[data-slot="store-article-card-sold-out"]'),
    tile: card.querySelector('[data-slot="store-article-card-tile"]'),
  };
}

describe("StoreArticleCard", () => {
  test("is one link, named after the article, stretched over the whole card", () => {
    const { card, link } = setup();

    expect(within(card).getAllByRole("link")).toEqual([link]);
    expect(link).toHaveAccessibleName("Pearl necklace");
    expect(link).toHaveAttribute("href", "/en/products/pearl-necklace");
    expect(link).toHaveClass("after:absolute", "after:inset-0");
    expect(card).toHaveClass("relative");
    expect(card).toHaveAttribute("data-slot", "store-article-card");
  });

  test("draws the keyboard focus ring inside the card its link covers", () => {
    const { card, link } = setup();

    expect(link).toHaveClass("outline-none");
    expect(card).toHaveClass(
      "has-[a:focus-visible]:outline-3",
      "has-[a:focus-visible]:-outline-offset-3",
      "has-[a:focus-visible]:outline-store-foreground"
    );
  });

  test("sets the photo on a square grey tile, then the name in the display face", () => {
    const { heading, tile } = setup({ image: PHOTO });

    expect(tile).toHaveClass("aspect-square", "bg-store-surface");
    expect(heading).toHaveClass("font-display", "uppercase", "text-xs");
  });

  test.each([
    [undefined, 3],
    ["h2", 2],
    ["h3", 3],
  ] as const)(
    "with headingLevel %s its name is a level %i heading",
    (headingLevel, level) => {
      setup({ headingLevel });

      expect(screen.getByRole("heading", { level })).toHaveTextContent(
        "Pearl necklace"
      );
    }
  );

  test("shows the price in the page's language, in regular type", () => {
    const { price } = setup();

    expect(price?.textContent).toBe(`UYU${NBSP}890`);
    expect(price).not.toHaveClass("font-display");
  });

  test("shows the photo with its alternative text and the widths it is given", () => {
    const { card } = setup({ image: PHOTO, sizes: "280px" });

    const photo = within(card).getByRole("img", {
      name: "A pearl necklace on a stand",
    });
    expect(photo.getAttribute("src")).toContain("pearl.jpg");
    expect(photo).toHaveAttribute("sizes", "280px");
    expect(photo).toHaveClass(
      "object-cover",
      "motion-safe:transition-transform"
    );
    expect(photo).not.toHaveClass("opacity-60");
    expect(
      card.querySelector('[data-slot="store-article-card-no-image"]')
    ).toBeNull();
  });

  test("asks for a quarter of the screen's width on a computer by default", () => {
    const { card } = setup({ image: PHOTO });

    expect(within(card).getByRole("img")).toHaveAttribute(
      "sizes",
      "(min-width: 768px) 25vw, 50vw"
    );
  });

  test.each([
    ["en", "No photo"],
    ["es", "Sin foto"],
  ] as const)("in %s, says %j where the photo would be", (locale, text) => {
    const { card } = setup({ locale });

    expect(
      card.querySelector('[data-slot="store-article-card-no-image"]')
    ).toHaveTextContent(text);
    expect(within(card).queryByRole("img")).toBeNull();
  });

  test("carries no label by default", () => {
    const { badge } = setup();

    expect(badge).toBeNull();
  });

  test.each([
    ["en", "New"],
    ["es", "Nuevo"],
  ] as const)(
    "in %s, a new article is marked %j on the tile's corner",
    (locale, text) => {
      const { badge, tile } = setup({ isNew: true, locale });

      expect(badge).toHaveTextContent(text);
      expect(tile).toContainElement(badge as HTMLElement);
      expect(badge).toHaveClass("absolute", "top-2.5", "left-2.5");
    }
  );

  test.each([
    ["en", `Was UYU${NBSP}1,290`],
    ["es", `Antes $${NBSP}1.290`],
  ] as const)(
    "in %s, a reduced article strikes the price it had, read as %j",
    (locale, spoken) => {
      const { badge, price } = setup({ locale, previousAmount: 129_000 });

      expect(price).toHaveAttribute("data-sale", "true");
      expect(
        price?.querySelector('[data-slot="store-price-tag-previous"] .sr-only')
          ?.textContent
      ).toBe(spoken);
      // The struck price says it: no label for a deal.
      expect(badge).toBeNull();
    }
  );

  test.each([
    ["en", "Sold out"],
    ["es", "Agotado"],
  ] as const)(
    "in %s, an unavailable article dims its name and says %j where the price was",
    (locale, text) => {
      const { card, heading, price, soldOut } = setup({
        image: PHOTO,
        locale,
        unavailable: true,
      });

      expect(soldOut).toHaveTextContent(new RegExp(`^${text}$`, "u"));
      expect(soldOut).toHaveClass("text-store-muted");
      expect(price).toBeNull();
      expect(heading).toHaveClass("text-store-muted");
      expect(within(card).getByRole("img")).toHaveClass("opacity-60");
      expect(card).toHaveAttribute("data-unavailable", "true");
    }
  );

  test("a sold-out article is not marked new", () => {
    const { badge } = setup({ isNew: true, unavailable: true });

    expect(badge).toBeNull();
  });

  test("an available article keeps its name in the foreground", () => {
    const { card, heading, soldOut } = setup();

    expect(heading).not.toHaveClass("text-store-muted");
    expect(soldOut).toBeNull();
    expect(card).toHaveAttribute("data-unavailable", "false");
  });

  test("uses the words it is given for its label, its price and its photo", () => {
    const { badge, card, price } = setup({
      isNew: true,
      labels: {
        card: {
          badgeNew: "Fresh",
          noImage: "Nothing to see",
          unavailable: "Gone",
        },
        price: { previous: "Before: {price}" },
      },
      previousAmount: 129_000,
    });

    expect(badge).toHaveTextContent(/^Fresh$/u);
    expect(
      price?.querySelector('[data-slot="store-price-tag-previous"] .sr-only')
        ?.textContent
    ).toBe(`Before: UYU${NBSP}1,290`);
    expect(
      card.querySelector('[data-slot="store-article-card-no-image"]')
    ).toHaveTextContent("Nothing to see");
  });

  test("draws its action above the stretched link, as a control of its own", () => {
    const { card, link } = setup({
      action: <button type="button">Add to cart: Pearl necklace</button>,
    });

    const button = within(card).getByRole("button", {
      name: "Add to cart: Pearl necklace",
    });
    expect(button.parentElement).toHaveClass("relative", "z-10");
    expect(link).not.toContainElement(button);
  });

  test("has no action slot without an action", () => {
    const { card } = setup();

    expect(within(card).queryByRole("button")).toBeNull();
    expect(card.querySelector(".z-10")).toBeNull();
  });

  test("marks the name's language on its link only, so the price keeps the page's", () => {
    const { card, link } = setup({ nameLang: "en" });

    expect(link).toHaveAttribute("lang", "en");
    expect(card).not.toHaveAttribute("lang");
    expect(
      card.querySelector('[data-slot="store-price-tag"]')?.closest("[lang]")
    ).toBeNull();
  });

  test("leaves the name's language to the page when none is given", () => {
    const { link } = setup();

    expect(link).not.toHaveAttribute("lang");
  });

  test("keeps a caller's class", () => {
    const { card } = setup({ className: "w-70" });

    expect(card).toHaveClass("w-70", "flex");
  });
});
