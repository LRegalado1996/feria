import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";

import { CREDIT_URL, StoreFooter, type StoreFooterProps } from "./store-footer";

type Store = StoreFooterProps["store"];

const INSTAGRAM = "https://instagram.com/lrmarket";
const TIKTOK = "https://tiktok.com/@lrmarket";

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
  locale = "en",
  store = makeStore(),
  tagline = null,
}: {
  locale?: Locale;
  store?: Store;
  tagline?: StoreFooterProps["tagline"];
} = {}) {
  render(
    <StoreFooter
      className="custom"
      copy={DICTIONARIES[locale].storefront.shell}
      store={store}
      tagline={tagline}
    />
  );
  const footer = screen.getByTestId("store-footer");

  return {
    footer,
    /** Each social link's name and address, in order. */
    links: () =>
      within(footer)
        .queryAllByRole("link")
        .filter((link) => link.dataset.testid !== "store-footer-credit")
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
    [{ instagramUrl: INSTAGRAM, whatsappNumber: "+59899123456" }, [IG, WA]],
    [{ tiktokUrl: TIKTOK, whatsappNumber: "+598-99-123-456" }, [TT, WA]],
    [
      {
        instagramUrl: INSTAGRAM,
        tiktokUrl: TIKTOK,
        whatsappNumber: "+598 99 123 456",
      },
      [IG, TT, WA],
    ],
  ])("with %j, links exactly %j", (overrides, expected) => {
    const { footer, links } = setup({ store: makeStore(overrides) });

    expect(links()).toEqual(expected);
    // No empty list is left behind when the store has no links.
    expect(within(footer).queryByRole("list") === null).toBe(
      expected.length === 0
    );
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

    expect(
      within(footer)
        .getAllByRole("link")
        .map((link) => [link.getAttribute("target"), link.getAttribute("rel")])
    ).toEqual(
      Array.from({ length: 4 }, () => ["_blank", "noopener noreferrer"])
    );
  });

  test("names the social links in Spanish on a Spanish page", () => {
    const { links } = setup({
      locale: "es",
      store: makeStore({
        instagramUrl: INSTAGRAM,
        tiktokUrl: TIKTOK,
        whatsappNumber: "+59899123456",
      }),
    });

    expect(links().map(([name]) => name)).toEqual([
      "Instagram de LR Market (se abre en otra pestaña)",
      "TikTok de LR Market (se abre en otra pestaña)",
      "Escribinos por WhatsApp (se abre en otra pestaña)",
    ]);
  });

  test("shows the tagline in the language it is written in", () => {
    const { footer } = setup({
      tagline: { lang: "es", text: "Joyas hechas a mano" },
    });

    expect(within(footer).getByText("Joyas hechas a mano")).toHaveAttribute(
      "lang",
      "es"
    );
  });

  test("shows no tagline when the store has none", () => {
    const { footer } = setup();

    expect(footer.querySelector("p")).toBeNull();
  });

  test.each([
    ["en", "Store footer", "Made by Lucas Regalado (opens in a new tab)"],
    [
      "es",
      "Pie de la tienda",
      "Hecho por Lucas Regalado (se abre en otra pestaña)",
    ],
  ] as const)(
    "in %s, is named and credits Lucas Regalado",
    (locale, name, credit) => {
      const { footer } = setup({ locale });

      expect(footer).toHaveAccessibleName(name);
      expect(footer).toHaveClass("custom");
      expect(CREDIT_URL).toBe("https://lucasregalado.com");
      expect(
        within(footer).getByRole("link", { name: credit })
      ).toHaveAttribute("href", "https://lucasregalado.com");
    }
  );
});
