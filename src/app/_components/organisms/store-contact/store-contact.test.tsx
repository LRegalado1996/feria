import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";

import { StoreContact, type StoreContactProps } from "./store-contact";

type Store = StoreContactProps["store"];

const INSTAGRAM = "https://instagram.com/lrmarket";
const TIKTOK = "https://tiktok.com/@lrmarket";
const FAIR = { lang: "es", text: "Feria del Parque · Puesto 12" };

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    instagramUrl: null,
    name: "LR Market",
    tiktokUrl: null,
    whatsappNumber: null,
    ...overrides,
  };
}

/** A store with every way to reach it. */
function makeFullStore(): Store {
  return makeStore({
    instagramUrl: INSTAGRAM,
    tiktokUrl: TIKTOK,
    whatsappNumber: "+59899123456",
  });
}

function setup({
  locale = "en",
  location = null,
  store = makeStore(),
}: {
  locale?: Locale;
  location?: StoreContactProps["location"];
  store?: Store;
} = {}) {
  render(
    <StoreContact
      browseHref="/en/productos"
      className="custom"
      copy={DICTIONARIES[locale].storefront}
      location={location}
      store={store}
    />
  );
  const page = screen.getByTestId("store-contact");

  return {
    /** The tiles drawn, in order, by what each is. */
    tiles: () =>
      [...page.querySelectorAll<HTMLElement>("section")].map(
        (tile) => tile.dataset.slot
      ),
    page,
    within: within(page),
  };
}

describe("StoreContact", () => {
  test("opens on the store's name, the page's one h1 and its line", () => {
    const { page, within: inPage } = setup({ store: makeFullStore() });

    expect(page).toHaveClass("custom");
    expect(inPage.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(inPage.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Contact$/u
    );
    expect(inPage.getByText("LR Market", { exact: true })).toHaveAttribute(
      "data-slot",
      "store-eyebrow"
    );
    expect(inPage.getByTestId("store-contact-lead")).toHaveTextContent(
      /^Write to us, stop by the stall or follow us\.$/u
    );
  });

  test("with everything set, draws the three tiles: how to write, where it is, how to buy", () => {
    const { tiles } = setup({ location: FAIR, store: makeFullStore() });

    expect(tiles()).toEqual([
      "store-contact-reach",
      "store-contact-location",
      "store-contact-how",
    ]);
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
    "WhatsApp is the main action: a lime pill showing %s, leading to the chat by its digits, in a new tab",
    (_case, stored, shown) => {
      const { within: inPage } = setup({
        store: makeStore({ whatsappNumber: stored }),
      });

      const tile = within(
        inPage.getByRole("region", { name: "Write to us on WhatsApp" })
      );
      const link = tile.getByRole("link", {
        name: `WhatsApp ${shown} (opens in a new tab)`,
      });
      expect(link).toHaveAttribute(
        "href",
        `https://wa.me/${stored.replace("+", "")}`
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAttribute("data-variant", "accent");
      expect(link).toHaveAttribute("data-size", "lg");
      expect(
        tile.getByText(
          "It is the fastest way: ask us about an article, your order or the delivery."
        )
      ).toBeVisible();
    }
  );

  test.each([
    [{ instagramUrl: INSTAGRAM }, [["LR Market on Instagram", INSTAGRAM]]],
    [{ tiktokUrl: TIKTOK }, [["LR Market on TikTok", TIKTOK]]],
    [
      { instagramUrl: INSTAGRAM, tiktokUrl: TIKTOK },
      [
        ["LR Market on Instagram", INSTAGRAM],
        ["LR Market on TikTok", TIKTOK],
      ],
    ],
  ])(
    "under WhatsApp, lists only the profiles the store has: %j",
    (profiles, expected) => {
      const { within: inPage } = setup({
        store: makeStore({ ...profiles, whatsappNumber: "+59899123456" }),
      });

      const tile = within(
        inPage.getByRole("region", { name: "Write to us on WhatsApp" })
      );
      // Under the tile's own title, the profiles' is one level down.
      expect(
        tile.getByRole("heading", { level: 3, name: "Follow us" })
      ).toBeVisible();
      expect(
        within(tile.getByRole("list"))
          .getAllByRole("link")
          .map((link) => [
            link.textContent,
            link.getAttribute("href"),
            link.getAttribute("target"),
          ])
      ).toEqual(
        expected.map(([name, href]) => [
          `${name} (opens in a new tab)`,
          href,
          "_blank",
        ])
      );
    }
  );

  test("with WhatsApp and no profile, the tile has no list of them", () => {
    const { within: inPage } = setup({
      store: makeStore({ whatsappNumber: "+59899123456" }),
    });

    const tile = within(
      inPage.getByRole("region", { name: "Write to us on WhatsApp" })
    );
    expect(tile.queryByRole("list")).toBeNull();
    expect(tile.queryByText("Follow us")).toBeNull();
  });

  test("with profiles and no WhatsApp, the tile is the profiles', named by their title", () => {
    const { within: inPage } = setup({
      store: makeStore({ instagramUrl: INSTAGRAM }),
    });

    const tile = within(inPage.getByRole("region", { name: "Follow us" }));
    expect(
      tile.getByRole("heading", { level: 2, name: "Follow us" })
    ).toBeVisible();
    expect(tile.getAllByRole("link")).toHaveLength(1);
    expect(
      tile.getByRole("link", {
        name: "LR Market on Instagram (opens in a new tab)",
      })
    ).toHaveAttribute("href", INSTAGRAM);
    expect(inPage.queryByText("Write to us on WhatsApp")).toBeNull();
  });

  test("says where the store is in the store's own words, marked with their language", () => {
    const { within: inPage } = setup({ location: FAIR });

    const tile = within(
      inPage.getByRole("region", { name: "Where to find us" })
    );
    const address = tile.getByText("Feria del Parque · Puesto 12");
    expect(address.tagName).toBe("ADDRESS");
    expect(address).toHaveAttribute("lang", "es");
    expect(address).toHaveClass("wrap-anywhere");
  });

  test("a store that says where it is and nothing else draws that tile and how to buy, with the page's usual line", () => {
    const { tiles, within: inPage } = setup({ location: FAIR });

    expect(tiles()).toEqual(["store-contact-location", "store-contact-how"]);
    expect(inPage.getByTestId("store-contact-lead")).toHaveTextContent(
      /^Write to us, stop by the stall or follow us\.$/u
    );
  });

  test("a store with no contact data at all says so and still offers the catalog: no empty tile", () => {
    const { tiles, within: inPage } = setup();

    expect(tiles()).toEqual(["store-contact-how"]);
    expect(inPage.getByTestId("store-contact-lead")).toHaveTextContent(
      /^We have not added our contact details yet\. Meanwhile, browse the catalog and order from here\.$/u
    );
    expect(
      inPage.getByRole("link", { name: "See the catalog" })
    ).toHaveAttribute("href", "/en/productos");
    expect(inPage.queryByRole("link", { name: /WhatsApp/u })).toBeNull();
  });

  test("always says how to buy in three ordered steps, the ways to pay and the way into the catalog", () => {
    const { within: inPage } = setup({ store: makeFullStore() });

    const tile = within(inPage.getByRole("region", { name: "Buy in 3 steps" }));
    const [steps] = tile.getAllByRole("list");
    expect(steps?.tagName).toBe("OL");
    expect(
      [...(steps?.querySelectorAll("li") ?? [])].map((step) =>
        [...step.querySelectorAll("p")].map((line) => line.textContent)
      )
    ).toEqual([
      ["Choose", "Browse the catalog on the site."],
      ["Add to cart", "Leave your name and your mobile number."],
      ["We arrange delivery", "Pick it up at the stall or we send it to you."],
    ]);
    expect(
      within(tile.getByRole("list", { name: "Pay with" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "Cash",
      "Credit and debit cards",
      "Mercado Pago",
      "Bank transfer",
    ]);
    expect(tile.getByRole("link", { name: "See the catalog" })).toHaveAttribute(
      "href",
      "/en/productos"
    );
  });

  test("is one column on a phone and two from lg up, the moss tile beside both grey ones when the store says where it is", () => {
    const { page } = setup({ location: FAIR, store: makeFullStore() });

    const grid = page.querySelector(
      '[data-slot="store-contact-reach"]'
    )?.parentElement;
    expect(grid).toHaveClass("grid", "lg:grid-cols-2");
    expect(page.querySelector('[data-slot="store-contact-reach"]')).toHaveClass(
      "bg-store-contrast",
      "lg:row-span-2"
    );
    expect(
      page.querySelector('[data-slot="store-contact-location"]')
    ).toHaveClass("bg-store-surface");
  });

  test("without a place, the moss tile keeps its own row", () => {
    const { page } = setup({ store: makeFullStore() });

    expect(
      page.querySelector('[data-slot="store-contact-reach"]')
    ).not.toHaveClass("lg:row-span-2");
  });

  test("says everything in Spanish on a Spanish page", () => {
    const { within: inPage } = setup({
      locale: "es",
      location: FAIR,
      store: makeFullStore(),
    });

    expect(inPage.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Contacto$/u
    );
    expect(inPage.getByTestId("store-contact-lead")).toHaveTextContent(
      /^Escribinos, pasá por el puesto o seguinos en las redes\.$/u
    );
    expect(
      inPage.getByRole("link", {
        name: "WhatsApp 099 123 456 (se abre en otra pestaña)",
      })
    ).toHaveAttribute("href", "https://wa.me/59899123456");
    expect(
      inPage.getByRole("region", { name: "Escribinos por WhatsApp" })
    ).toHaveTextContent(
      "Es la forma más rápida: preguntanos por un artículo, por tu pedido o por la entrega."
    );
    expect(
      inPage.getByRole("link", {
        name: "Instagram de LR Market (se abre en otra pestaña)",
      })
    ).toHaveAttribute("href", INSTAGRAM);
    expect(
      inPage.getByRole("heading", { level: 3, name: "Seguinos" })
    ).toBeVisible();
    expect(
      inPage.getByRole("region", { name: "Dónde encontrarnos" })
    ).toHaveTextContent("Feria del Parque · Puesto 12");
    expect(
      inPage.getByRole("region", { name: "Comprá en 3 pasos" })
    ).toHaveTextContent("Pagás con");
    expect(
      inPage.getByRole("link", { name: "Ver el catálogo" })
    ).toHaveAttribute("href", "/en/productos");
  });

  test("in Spanish, a store with no contact data says so in Spanish", () => {
    const { within: inPage } = setup({ locale: "es" });

    expect(inPage.getByTestId("store-contact-lead")).toHaveTextContent(
      /^Todavía no cargamos nuestros datos de contacto\. Mientras tanto, mirá el catálogo y hacé tu pedido desde acá\.$/u
    );
  });
});
