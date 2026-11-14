import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  StoreArticleCard,
  type StoreArticleCardProps,
} from "./store-article-card";

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// Intl separates a currency from its amount with a no-break space.
const NBSP = "\u00A0";

function setup(props: Partial<StoreArticleCardProps> = {}) {
  render(
    <StoreArticleCard
      amount={89_000}
      currency="UYU"
      href="/en/lr/articles/pearl-necklace"
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
    link: within(card).getByRole("link"),
    price: card.querySelector('[data-slot="store-price-tag-amount"]'),
  };
}

describe("StoreArticleCard", () => {
  test("is one link, named after the article, stretched over the whole card", () => {
    const { card, link } = setup();

    expect(within(card).getAllByRole("link")).toEqual([link]);
    expect(link).toHaveAccessibleName("Pearl necklace");
    expect(link).toHaveAttribute("href", "/en/lr/articles/pearl-necklace");
    expect(link).toHaveClass("after:absolute", "after:inset-0");
    expect(card).toHaveClass("relative");
    expect(card).toHaveAttribute("data-slot", "store-article-card");
  });

  test("draws the keyboard focus ring on the card its link covers", () => {
    const { card, link } = setup();

    expect(link).toHaveClass("outline-none");
    expect(card).toHaveClass(
      "has-[a:focus-visible]:outline-3",
      "has-[a:focus-visible]:outline-store-foreground"
    );
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

  test("shows the price in the page's language", () => {
    const { price } = setup();

    expect(price?.textContent).toBe(`UYU${NBSP}890`);
  });

  test("shows the photo with its alternative text when there is one", () => {
    const { card } = setup({
      image: { alt: "A pearl necklace on a stand", src: "/pearl.jpg" },
    });

    const photo = within(card).getByRole("img", {
      name: "A pearl necklace on a stand",
    });
    expect(photo.getAttribute("src")).toContain("pearl.jpg");
    expect(photo).toHaveClass("object-cover", "motion-reduce:transition-none");
    expect(
      card.querySelector('[data-slot="store-article-card-no-image"]')
    ).toBeNull();
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

  test("carries no badge by default", () => {
    const { badge } = setup();

    expect(badge).toBeNull();
  });

  test.each([
    ["en", "New"],
    ["es", "Nuevo"],
  ] as const)(
    "in %s, a new article is marked %j on the accent",
    (locale, text) => {
      const { badge } = setup({ isNew: true, locale });

      expect(badge).toHaveTextContent(text);
      expect(badge).toHaveAttribute("data-tone", "accent");
    }
  );

  test.each([
    ["en", "Price drop", `Was UYU${NBSP}1,290`],
    ["es", "Bajó de precio", `Antes $${NBSP}1.290`],
  ] as const)(
    "in %s, a reduced article is marked %j and shows what it cost",
    (locale, text, previous) => {
      const { badge, card } = setup({ locale, previousAmount: 129_000 });

      expect(badge).toHaveTextContent(text);
      expect(badge).toHaveAttribute("data-tone", "contrast");
      expect(
        card.querySelector('[data-slot="store-price-tag-previous"]')
          ?.textContent
      ).toBe(previous);
    }
  );

  test("a reduced price outranks new: one badge a card", () => {
    const { card } = setup({ isNew: true, previousAmount: 129_000 });

    const badges = [...card.querySelectorAll('[data-slot="store-badge"]')];
    expect(badges.map((badge) => badge.textContent)).toEqual(["Price drop"]);
  });

  test("a previous price that was not higher leaves a new article marked new", () => {
    const { badge } = setup({ isNew: true, previousAmount: 89_000 });

    expect(badge).toHaveTextContent("New");
  });

  test("keeps a caller's class", () => {
    const { card } = setup({ className: "w-70" });

    expect(card).toHaveClass("w-70", "flex");
  });
});
