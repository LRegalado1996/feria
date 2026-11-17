import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";
import { required } from "@/test/required";

import { CREDIT_URL, StoreFooter, type StoreFooterProps } from "./store-footer";

type Store = StoreFooterProps["store"];

const INSTAGRAM = "https://instagram.com/lrmarket";
const TIKTOK = "https://tiktok.com/@lrmarket";

// A group holding Anillos, then Aros in no group (FER-043).
const CATEGORIES = [
  {
    id: 6,
    lang: "es",
    name: "Bijouterie",
    parentId: null,
    path: "/bijouterie",
    slug: "bijouterie",
  },
  {
    id: 1,
    lang: "es",
    name: "Anillos",
    parentId: 6,
    path: "/bijouterie/anillos",
    slug: "anillos",
  },
  {
    id: 2,
    lang: "es",
    name: "Aros",
    parentId: null,
    path: "/aros",
    slug: "aros",
  },
];

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    instagramUrl: null,
    name: "LR Market",
    tiktokUrl: null,
    whatsappNumber: null,
    ...overrides,
  };
}

function setup({
  categories = CATEGORIES,
  locale = "en",
  store = makeStore(),
}: {
  categories?: StoreFooterProps["categories"];
  locale?: Locale;
  store?: Store;
} = {}) {
  render(
    <StoreFooter
      categories={categories}
      className="custom"
      copy={DICTIONARIES[locale].storefront.shell}
      locale={locale}
      store={store}
    />
  );
  const footer = screen.getByTestId("store-footer");

  return {
    footer,
    /** The links that leave the site, but the credit: name and address. */
    outside: () =>
      within(footer)
        .queryAllByRole("link")
        .filter(
          (link) =>
            link.getAttribute("target") === "_blank" &&
            link.dataset.testid !== "store-footer-credit"
        )
        .map((link) => [link.textContent, link.getAttribute("href")]),
  };
}

const NEW_TAB = " (opens in a new tab)";
const IG = [`LR Market on Instagram${NEW_TAB}`, INSTAGRAM];
const TT = [`LR Market on TikTok${NEW_TAB}`, TIKTOK];
const WA = [`Write to us on WhatsApp${NEW_TAB}`, "https://wa.me/59899123456"];

describe("StoreFooter", () => {
  test.each([
    [{}, []],
    [{ instagramUrl: INSTAGRAM }, [IG]],
    [{ tiktokUrl: TIKTOK }, [TT]],
    [{ whatsappNumber: "+598 99 123 456" }, [WA]],
    [{ instagramUrl: INSTAGRAM, tiktokUrl: TIKTOK }, [IG, TT]],
    [{ instagramUrl: INSTAGRAM, whatsappNumber: "+59899123456" }, [WA, IG]],
    [{ tiktokUrl: TIKTOK, whatsappNumber: "+598-99-123-456" }, [WA, TT]],
    [
      {
        instagramUrl: INSTAGRAM,
        tiktokUrl: TIKTOK,
        whatsappNumber: "+598 99 123 456",
      },
      [WA, IG, TT],
    ],
  ])("with %j, links out to exactly %j", (overrides, expected) => {
    const { outside } = setup({ store: makeStore(overrides) });

    expect(outside()).toEqual(expected);
  });

  test.each([
    ["three blocks, without social links", makeStore(), 2],
    [
      "four blocks, with them",
      makeStore({ instagramUrl: INSTAGRAM, tiktokUrl: TIKTOK }),
      3,
    ],
  ])(
    "with %s, spreads them across the whole width from lg up, the story's measure held",
    (_case, store, columns) => {
      const { footer } = setup({ store });

      // One row from lg up, first block on the left edge, last on the
      // right, even gaps between however many there are.
      const blocks = required(
        footer.querySelector('[data-slot="store-footer-blocks"]')
      );
      expect(blocks).toHaveClass(
        "flex",
        "flex-col",
        "lg:flex-row",
        "lg:justify-between"
      );
      expect(blocks.firstElementChild).toBe(
        within(footer).getByTestId("store-footer-brand")
      );
      // The columns join that row (`contents`); below lg they share a row
      // of their own, two side by side on a phone, spread on a tablet.
      const columnsBox = required(blocks.lastElementChild);
      expect(columnsBox).toHaveClass(
        "grid",
        "grid-cols-2",
        "md:flex",
        "md:justify-between",
        "lg:contents"
      );
      expect(columnsBox.children).toHaveLength(columns);
      // About 48 characters a line, the signature under it.
      expect(within(footer).getByTestId("store-footer-story")).toHaveClass(
        "max-w-[40ch]",
        "text-sm"
      );
    }
  );

  test("leaves out the follow section when the store has no social link", () => {
    const { footer } = setup({ store: makeStore({ whatsappNumber: "+1" }) });

    expect(
      within(footer).queryByRole("heading", { name: "Follow us" })
    ).toBeNull();
  });

  test.each([
    ["en", "Shop", "Catalog", "/en"],
    ["es", "Tienda", "Catálogo", ""],
  ] as const)(
    "in %s, the %s links lead to the catalog, then each group and each category in none, in the store's order, never a group's categories",
    (locale, heading, catalog, prefix) => {
      const { footer } = setup({ locale });

      const shop = within(
        within(footer).getByRole("navigation", { name: heading })
      );
      expect(
        shop
          .getAllByRole("listitem")
          .map((item) => [
            item.textContent,
            item.querySelector("a")?.getAttribute("href"),
          ])
      ).toEqual([
        [catalog, `${prefix}/productos`],
        ["Bijouterie", `${prefix}/bijouterie`],
        ["Aros", `${prefix}/aros`],
      ]);
      expect(shop.getByRole("link", { name: "Bijouterie" })).toHaveAttribute(
        "lang",
        "es"
      );
      expect(shop.queryByRole("link", { name: "Anillos" })).toBeNull();
    }
  );

  test("with no category, the shop links lead to all articles alone", () => {
    const { footer } = setup({ categories: [] });

    const shop = within(
      within(footer).getByRole("navigation", { name: "Shop" })
    );
    expect(
      shop
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([["Catalog", "/en/productos"]]);
  });

  test.each([
    ["en", "Help", "Pick what you like, add it to the cart"],
    ["es", "Ayuda", "Elegí lo que te guste, agregalo al carrito"],
  ] as const)("in %s, %s says how to order", (locale, heading, howTo) => {
    const { footer } = setup({ locale });

    const help = within(footer).getByRole("region", { name: heading });
    expect(help).toHaveTextContent(howTo);
  });

  test.each([
    ["en", "/en", "LR Market, go to the home page"],
    ["es", "/", "LR Market, ir al inicio"],
  ] as const)(
    "in %s, leads home at %s from the full logo",
    (locale, href, name) => {
      const { footer } = setup({ locale });

      const home = within(footer).getByRole("link", { name });
      expect(home).toHaveAttribute("href", href);
      expect(home.querySelector('[data-slot="store-logo"]')).toHaveAttribute(
        "data-variant",
        "full"
      );
    }
  );

  test("its headings are the accent on the moss, in the display face", () => {
    const { footer } = setup({ store: makeStore({ tiktokUrl: TIKTOK }) });

    expect(footer).toHaveClass("bg-store-contrast", "text-store-background");
    for (const heading of within(footer).getAllByRole("heading", {
      level: 2,
    })) {
      expect(heading).toHaveClass(
        "text-store-accent",
        "font-display",
        "uppercase"
      );
    }
  });

  test("says, out of sight, that each outside link opens a new tab", () => {
    const { footer } = setup({ store: makeStore({ instagramUrl: INSTAGRAM }) });

    const instagram = within(footer).getByRole("link", {
      name: "LR Market on Instagram (opens in a new tab)",
    });
    expect(within(instagram).getByText("(opens in a new tab)")).toHaveClass(
      "sr-only"
    );
    expect(
      within(footer).getByRole("link", {
        name: "Made by Lucas Regalado (opens in a new tab)",
      })
    ).toHaveAttribute("href", CREDIT_URL);
  });

  test("opens every outside link in a new tab, without handing it this page", () => {
    const { footer } = setup({
      store: makeStore({
        instagramUrl: INSTAGRAM,
        tiktokUrl: TIKTOK,
        whatsappNumber: "+59899123456",
      }),
    });

    const outside = within(footer)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("https://"));
    expect(
      outside.map((link) => [
        link.getAttribute("target"),
        link.getAttribute("rel"),
      ])
    ).toEqual(
      Array.from({ length: 4 }, () => ["_blank", "noopener noreferrer"])
    );
  });

  test("names the outside links in Spanish on a Spanish page", () => {
    const { outside } = setup({
      locale: "es",
      store: makeStore({
        instagramUrl: INSTAGRAM,
        tiktokUrl: TIKTOK,
        whatsappNumber: "+59899123456",
      }),
    });

    expect(outside().map(([name]) => name)).toEqual([
      "Escribinos por WhatsApp (se abre en otra pestaña)",
      "Instagram de LR Market (se abre en otra pestaña)",
      "TikTok de LR Market (se abre en otra pestaña)",
    ]);
  });

  test.each([
    [
      "es",
      "Hace más de 20 años que mi familia arma su puesto en la feria navideña.",
      "pasá por el puesto 86 o pedí desde acá.",
    ],
    [
      "en",
      "For more than 20 years my family has set up its stall at the Christmas fair.",
      "come by stall 86 or order from here.",
    ],
  ] as const)(
    "in %s, tells Pepe's story under the logo, signed, as a quote with its author",
    (locale, opening, closing) => {
      const { footer } = setup({ locale });

      const story = within(footer).getByTestId("store-footer-story");
      expect(story.tagName).toBe("FIGURE");
      const quote = required(story.querySelector("blockquote"));
      expect(quote.textContent?.startsWith(opening)).toBe(true);
      expect(quote.textContent?.endsWith(closing)).toBe(true);
      expect(story.querySelector("figcaption")).toHaveTextContent(/^Pepe$/u);
      // Right under the logo, before the shop's links.
      const logo = within(footer).getAllByRole("link")[0];
      expect(logo?.querySelector('[data-slot="store-logo"]')).not.toBeNull();
      expect(logo?.nextElementSibling).toBe(story);
    }
  );

  test.each([
    ["en", "Store footer", "Made by Lucas Regalado (opens in a new tab)"],
    [
      "es",
      "Pie de la tienda",
      "Hecho por Lucas Regalado (se abre en otra pestaña)",
    ],
  ] as const)(
    "in %s, is named, signs with the store and credits Lucas Regalado",
    (locale, name, credit) => {
      const { footer } = setup({
        locale,
        store: makeStore({ name: "Tienda Uno" }),
      });

      expect(footer).toHaveAccessibleName(name);
      expect(footer).toHaveClass("custom");
      expect(within(footer).getByText("© Tienda Uno")).toBeVisible();
      expect(CREDIT_URL).toBe("https://lucasregalado.com");
      expect(
        within(footer).getByRole("link", { name: credit })
      ).toHaveAttribute("href", "https://lucasregalado.com");
    }
  );
});
