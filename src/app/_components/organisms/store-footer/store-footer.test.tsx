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
  location,
  store = makeStore(),
}: {
  categories?: StoreFooterProps["categories"];
  locale?: Locale;
  location?: StoreFooterProps["location"];
  store?: Store;
} = {}) {
  render(
    <StoreFooter
      categories={categories}
      className="custom"
      copy={DICTIONARIES[locale].storefront.shell}
      locale={locale}
      location={location}
      payments={DICTIONARIES[locale].storefront.payments}
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
// The link shows the number as people here write it; `wa.me` takes digits.
const WA = [`WhatsApp 099 123 456${NEW_TAB}`, "https://wa.me/59899123456"];

describe("StoreFooter", () => {
  test.each([
    [{}, []],
    [{ instagramUrl: INSTAGRAM }, [IG]],
    [{ tiktokUrl: TIKTOK }, [TT]],
    [{ whatsappNumber: "+59899123456" }, [WA]],
    [{ instagramUrl: INSTAGRAM, tiktokUrl: TIKTOK }, [IG, TT]],
    [{ instagramUrl: INSTAGRAM, whatsappNumber: "+59899123456" }, [WA, IG]],
    [{ tiktokUrl: TIKTOK, whatsappNumber: "+59899123456" }, [WA, TT]],
    [
      {
        instagramUrl: INSTAGRAM,
        tiktokUrl: TIKTOK,
        whatsappNumber: "+59899123456",
      },
      [WA, IG, TT],
    ],
  ])("with %j, links out to exactly %j", (overrides, expected) => {
    const { outside } = setup({ store: makeStore(overrides) });

    expect(outside()).toEqual(expected);
  });

  test.each([
    [
      "three blocks, with no way to reach the store",
      makeStore(),
      ["store-footer-brand", "store-footer-shop", "store-footer-help"],
    ],
    [
      "four blocks, with one",
      makeStore({ instagramUrl: INSTAGRAM, tiktokUrl: TIKTOK }),
      [
        "store-footer-brand",
        "store-footer-shop",
        "store-footer-help",
        "store-footer-contact",
      ],
    ],
  ])(
    "with %s, stacks them below lg and spreads them across the whole width from lg up, the story's measure held",
    (_case, store, order) => {
      const { footer } = setup({ store });

      // A column below lg; one row from lg up, first block on the left
      // edge, last on the right, even gaps between however many there are.
      const blocks = within(footer).getByTestId("store-footer-blocks");
      expect(blocks).toHaveClass(
        "flex",
        "flex-col",
        "lg:flex-row",
        "lg:justify-between",
        "lg:gap-x-10"
      );
      // Every block is the row's own child, in the reading order: nothing
      // pairs two of them on a phone any more (FER-050).
      expect(
        [...blocks.children]
          .filter((block) => block instanceof HTMLElement)
          .map((block) => block.dataset.testid)
      ).toEqual(order);
      for (const block of blocks.children) {
        // Below lg: room around each and a hairline over all but the
        // first; from lg up, none of it, as the row had.
        expect(block).toHaveClass(
          "py-8",
          "border-t",
          "border-store-background/15",
          "first:border-t-0",
          "first:pt-0",
          "last:pb-0",
          "lg:border-t-0",
          "lg:py-0"
        );
      }
      // About 48 characters a line, the signature under it.
      expect(within(footer).getByTestId("store-footer-story")).toHaveClass(
        "max-w-[40ch]",
        "text-sm"
      );
    }
  );

  test.each([
    ["store-footer-shop", makeStore()],
    ["store-footer-contact", makeStore({ instagramUrl: INSTAGRAM })],
  ])(
    "below lg, %s puts its title on its own line and its links side by side on one line under it, one under the other from lg up",
    (testId, store) => {
      const { footer } = setup({ store });

      const block = within(footer).getByTestId(testId);
      const [heading, list] = [...block.children];
      expect(required(heading).tagName).toBe("H2");
      expect(required(list).tagName).toBe("UL");
      // A wrapping row below lg (one line at 320 px with the store's three
      // links), a plain list from lg up.
      expect(list).toHaveClass("flex", "flex-wrap", "gap-x-6", "lg:block");
    }
  );

  test("leaves out the contact block when the store has no way to reach it: no place, no WhatsApp, no social link", () => {
    const { footer } = setup();

    expect(
      within(footer).queryByRole("heading", { name: "Contact" })
    ).toBeNull();
    expect(within(footer).queryByTestId("store-footer-contact")).toBeNull();
  });

  test.each([
    ["where it is", { location: { lang: "es", text: "Feria del Parque" } }],
    ["a WhatsApp number", { store: makeStore({ whatsappNumber: "+1" }) }],
    ["a social link", { store: makeStore({ tiktokUrl: TIKTOK }) }],
  ])("shows the contact block for a store with only %s", (_case, options) => {
    const { footer } = setup(options);

    expect(
      within(footer).getByRole("region", { name: "Contact" })
    ).toBeVisible();
  });

  test.each([
    ["en", "Contact", "Where to find us"],
    ["es", "Contacto", "Dónde encontrarnos"],
  ] as const)(
    "in %s, %s says where to find the store in the store's own words, marked with their language (FER-078)",
    (locale, heading, label) => {
      const { footer } = setup({
        locale,
        location: {
          lang: "es",
          text: "Feria del Parque · Puesto 12 · Desde las 18 h",
        },
      });

      const place = within(
        within(footer).getByRole("region", { name: heading })
      ).getByTestId("store-footer-location");
      expect(place).toHaveTextContent(
        `${label}Feria del Parque · Puesto 12 · Desde las 18 h`
      );
      const address = required(place.querySelector("address"));
      expect(address).toHaveTextContent(
        /^Feria del Parque · Puesto 12 · Desde las 18 h$/u
      );
      expect(address).toHaveAttribute("lang", "es");
      // The store's own words may have no space to break at.
      expect(address).toHaveClass("wrap-anywhere");
    }
  );

  test("says nothing of a place the store did not write", () => {
    const { footer } = setup({
      location: null,
      store: makeStore({ whatsappNumber: "+59899123456" }),
    });

    expect(within(footer).queryByTestId("store-footer-location")).toBeNull();
    expect(footer).not.toHaveTextContent("Where to find us");
  });

  test.each([
    [
      "a Uruguayan mobile, as it is written here",
      "+59899123456",
      "099 123 456",
    ],
    [
      "a number of another country, as stored",
      "+5491112345678",
      "+5491112345678",
    ],
  ])(
    "its WhatsApp link shows %s, and leads to the chat by its digits",
    (_case, stored, shown) => {
      const { footer } = setup({
        store: makeStore({ whatsappNumber: stored }),
      });

      const link = within(footer).getByTestId("store-footer-whatsapp");
      expect(link).toHaveAccessibleName(
        `WhatsApp ${shown} (opens in a new tab)`
      );
      expect(link).toHaveAttribute(
        "href",
        `https://wa.me/${stored.replace("+", "")}`
      );
    }
  );

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
    [
      "en",
      "Help",
      "Choose from the catalog, add to the cart with your name and your mobile number, and we arrange payment and delivery: pick it up at the stall or we send it to you.",
      "Pay with",
      ["Cash", "Credit and debit cards", "Mercado Pago", "Bank transfer"],
    ],
    [
      "es",
      "Ayuda",
      "Elegí en el catálogo, agregá al carrito con tu nombre y tu celular, y coordinamos el pago y la entrega: retirás en el puesto o te lo mandamos.",
      "Pagás con",
      [
        "Efectivo",
        "Tarjetas de crédito y débito",
        "Mercado Pago",
        "Transferencia bancaria",
      ],
    ],
  ] as const)(
    "in %s, %s says how to buy in one line, then the ways to pay as a list named by its title",
    (locale, heading, howTo, title, ways) => {
      const { footer } = setup({ locale });

      const help = within(
        within(footer).getByRole("region", { name: heading })
      );
      expect(help.getByTestId("store-footer-how-to-order")).toHaveTextContent(
        new RegExp(`^${howTo}$`, "u")
      );
      const payments = help.getByRole("list", { name: title });
      // A screen reader hears four items; the dots between are for the eye.
      expect(
        within(payments)
          .getAllByRole("listitem")
          // Each item's own words, without the dot drawn before it.
          .map((item) => item.textContent.replace(/^ · /u, ""))
      ).toEqual(ways);
      expect(payments).toHaveTextContent(ways.join(" · "));
    }
  );

  test.each([
    ["en", "/en", "LR Market, go to the home page"],
    ["es", "/", "LR Market, ir a la home"],
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
      "WhatsApp 099 123 456 (se abre en otra pestaña)",
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
