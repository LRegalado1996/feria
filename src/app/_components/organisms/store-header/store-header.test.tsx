import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import {
  BAR_CATEGORIES_MAX,
  STORE_MAIN_ID,
  StoreHeader,
  type StoreHeaderCategory,
  type StoreHeaderProps,
} from "./store-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/** The seed's five categories. */
const CATEGORIES: StoreHeaderCategory[] = [
  { lang: "es", name: "Burbujeros", slug: "burbujeros" },
  { lang: "es", name: "Cadenas", slug: "cadenas" },
  { lang: "es", name: "Anillos", slug: "anillos" },
  { lang: "es", name: "Aros", slug: "aros" },
  { lang: "es", name: "Pulseras", slug: "pulseras" },
];

async function setup({
  categories,
  current,
  locale = "en",
}: {
  categories?: readonly StoreHeaderCategory[];
  current?: StoreHeaderProps["current"];
  locale?: Locale;
} = {}) {
  // Resolved inside act, as a stream would deliver them.
  await act(async () => {
    renderWithI18n(
      <StoreHeader
        categories={categories ? Promise.resolve(categories) : undefined}
        className="custom"
        copy={DICTIONARIES[locale].storefront.shell}
        current={current}
        locale={locale}
      />,
      { locale }
    );
    await Promise.resolve();
  });
  const copy = DICTIONARIES[locale].storefront.shell;

  const barElement = () =>
    screen.getByRole("navigation", { name: copy.navigation });

  return {
    bar: () => within(barElement()),
    barElement,
    /** The open menu. */
    dialog: () => screen.getByRole("dialog", { name: copy.menu }),
    header: screen.getByTestId("store-header"),
    home: screen.getByTestId("store-header-home"),
    user: userEvent.setup(),
  };
}

/**
 * Each link inside an element, as its text and its address. The language
 * pill shows codes; it counts by its name, the text a screen reader reads.
 */
function linksOf(scope: HTMLElement): [string, string | null][] {
  return within(scope)
    .getAllByRole("link")
    .map((link) => [
      link.dataset.slot === "locale-toggle"
        ? (link.querySelector(".sr-only")?.textContent ?? "")
        : link.textContent,
      link.getAttribute("href"),
    ]);
}

describe("StoreHeader", () => {
  test.each([
    ["en", "/en", "LR Market, go to the home page"],
    ["es", "/", "LR Market, ir al inicio"],
  ] as const)(
    "in %s, leads home at %s from the full logo, named %j",
    async (locale, href, name) => {
      const { home } = await setup({ locale });

      const logo = home.querySelector('[data-slot="store-logo"]');
      expect(logo).toHaveAttribute("data-variant", "full");
      expect(logo).toHaveAttribute("aria-hidden", "true");
      expect(logo).toHaveClass("h-10", "xl:h-12.5");
      expect(home).toHaveAccessibleName(name);
      expect(home).toHaveAttribute("href", href);
    }
  );

  test("starts with a skip link to the page's main content", async () => {
    const { header } = await setup();

    expect(STORE_MAIN_ID).toBe("store-main");
    const skip = within(header).getAllByRole("link")[0];
    expect(skip).toHaveAccessibleName("Skip to content");
    expect(skip).toHaveAttribute("href", "#store-main");
  });

  test("is dark, sticky, and takes a className", async () => {
    const { header } = await setup();

    expect(header.tagName).toBe("HEADER");
    expect(header).toHaveClass(
      "sticky",
      "top-0",
      "bg-store-contrast",
      "custom"
    );
    expect(header).toHaveAttribute("data-slot", "store-header");
  });

  test.each([
    ["en", "Catalog", "/en/products"],
    ["es", "Catálogo", "/products"],
  ] as const)(
    "in %s, without its categories, its line links to the catalog alone",
    async (locale, name, href) => {
      const { barElement } = await setup({ locale });

      expect(linksOf(barElement())).toEqual([[name, href]]);
    }
  );

  test("its line links to the catalog, then to each category the line has room for", async () => {
    const { bar, barElement } = await setup({
      categories: CATEGORIES,
      locale: "es",
    });

    expect(linksOf(barElement())).toEqual([
      ["Catálogo", "/products"],
      ["Burbujeros", "/products?category=burbujeros"],
      ["Cadenas", "/products?category=cadenas"],
      ["Anillos", "/products?category=anillos"],
      ["Aros", "/products?category=aros"],
      ["Pulseras", "/products?category=pulseras"],
    ]);
    expect(bar().getByRole("link", { name: "Anillos" })).toHaveAttribute(
      "lang",
      "es"
    );
  });

  test("in English its category links lead to the English catalog", async () => {
    const { bar } = await setup({
      categories: [{ lang: "en", name: "Rings", slug: "anillos" }],
    });

    expect(bar().getByRole("link", { name: "Rings" })).toHaveAttribute(
      "href",
      "/en/products?category=anillos"
    );
  });

  test(`holds at most ${BAR_CATEGORIES_MAX} categories on its line`, async () => {
    const many = Array.from({ length: BAR_CATEGORIES_MAX + 1 }, (_, index) => ({
      lang: "es",
      name: `C${index}`,
      slug: `c${index}`,
    }));
    const { bar } = await setup({ categories: many, locale: "es" });

    // "Catálogo" and the first five.
    expect(bar().getAllByRole("link")).toHaveLength(BAR_CATEGORIES_MAX + 1);
    expect(
      bar().queryByRole("link", { name: `C${BAR_CATEGORIES_MAX}` })
    ).toBeNull();
  });

  test("stops at the first category whose name would not fit on the line", async () => {
    const { barElement } = await setup({
      categories: [
        { lang: "es", name: "Collares de perlas", slug: "collares" },
        { lang: "es", name: "Pistolas de burbujas", slug: "pistolas" },
        { lang: "es", name: "Aros", slug: "aros" },
      ],
      locale: "es",
    });

    // "Catálogo" (8) + 18 + 20 = 46 letters, past the 44 the line holds.
    expect(linksOf(barElement()).map(([name]) => name)).toEqual([
      "Catálogo",
      "Collares de perlas",
    ]);
  });

  test("marks the catalog's link as the current page on the catalog", async () => {
    const { bar } = await setup({ current: "catalog", locale: "es" });

    expect(bar().getByRole("link", { name: "Catálogo" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("marks nothing as current elsewhere", async () => {
    const { bar } = await setup({ locale: "es" });

    expect(bar().getByRole("link", { name: "Catálogo" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  test("its links are the accent on the moss, in the display face", async () => {
    const { bar } = await setup({ categories: CATEGORIES, locale: "es" });

    for (const link of bar().getAllByRole("link")) {
      expect(link).toHaveClass(
        "text-store-accent",
        "font-display",
        "uppercase",
        "min-h-11",
        "focus-visible:outline-store-accent"
      );
    }
  });

  test("opens the search, leads to the cart, and offers the language", async () => {
    const { header } = await setup({ locale: "es" });

    expect(
      within(header).getByRole("button", { name: "Buscar en la tienda" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(within(header).getByTestId("store-cart-button")).toHaveAttribute(
      "href",
      "/cart"
    );
    expect(
      within(header).getByRole("link", { name: "English" })
    ).toHaveAttribute("href", "/en");
  });

  test("on a phone, the menu holds home, the catalog, every category and the language", async () => {
    const many = [
      ...CATEGORIES,
      { lang: "es", name: "Relojes", slug: "relojes" },
    ];
    const { dialog, user } = await setup({
      categories: many,
      current: "catalog",
      locale: "es",
    });

    await user.click(screen.getByRole("button", { name: "Menú" }));

    const menu = within(screen.getByRole("dialog", { name: "Menú" }));
    expect(linksOf(dialog())).toEqual([
      ["Inicio", "/"],
      ["Catálogo", "/products"],
      ["Burbujeros", "/products?category=burbujeros"],
      ["Cadenas", "/products?category=cadenas"],
      ["Anillos", "/products?category=anillos"],
      ["Aros", "/products?category=aros"],
      ["Pulseras", "/products?category=pulseras"],
      ["Relojes", "/products?category=relojes"],
      ["English", "/en"],
    ]);
    expect(menu.getByRole("link", { name: "Catálogo" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(menu.getByRole("button", { name: "Cerrar el menú" })).toBeVisible();
  });

  test("on a phone without categories, the menu holds home, the catalog and the language", async () => {
    const { dialog, user } = await setup({ locale: "es" });

    await user.click(screen.getByRole("button", { name: "Menú" }));

    expect(linksOf(dialog()).map(([name]) => name)).toEqual([
      "Inicio",
      "Catálogo",
      "English",
    ]);
  });
});
