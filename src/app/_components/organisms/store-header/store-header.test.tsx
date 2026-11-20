import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { required } from "@/test/required";

import {
  BAR_CATEGORIES_MAX,
  STORE_MAIN_ID,
  StoreHeader,
  type StoreHeaderCategory,
} from "./store-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function makeCategory(
  id: number,
  name: string,
  slug: string,
  group: { id: number; slug: string } | null = null
): StoreHeaderCategory {
  return {
    id,
    lang: "es",
    name,
    parentId: group?.id ?? null,
    path: group ? `/${group.slug}/${slug}` : `/${slug}`,
    slug,
  };
}

const BIJOUTERIE = { id: 6, slug: "bijouterie" };

/**
 * The seed's catalog in Lucas's order (FER-044): the bubble guns, then
 * Bijouterie holding four (FER-043).
 */
const CATEGORIES: StoreHeaderCategory[] = [
  makeCategory(1, "Burbujeros", "burbujeros"),
  makeCategory(6, "Bijouterie", "bijouterie"),
  makeCategory(2, "Cadenas", "cadenas", BIJOUTERIE),
  makeCategory(3, "Anillos", "anillos", BIJOUTERIE),
  makeCategory(4, "Aros", "aros", BIJOUTERIE),
  makeCategory(5, "Pulseras", "pulseras", BIJOUTERIE),
];

async function setup({
  categories,
  currentPath,
  locale = "en",
  streamed = true,
}: {
  categories?: readonly StoreHeaderCategory[];
  currentPath?: string;
  locale?: Locale;
  /** Handed as a promise (a page read per request), else read already. */
  streamed?: boolean;
} = {}) {
  // Resolved inside act, as a stream would deliver them.
  await act(async () => {
    renderWithI18n(
      <StoreHeader
        categories={
          categories && streamed ? Promise.resolve(categories) : categories
        }
        className="custom"
        copy={DICTIONARIES[locale].storefront.shell}
        currentPath={currentPath}
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
    ["es", "/", "LR Market, ir a la home"],
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
    ["en", "Catalog", "/en/productos"],
    ["es", "Catálogo", "/productos"],
  ] as const)(
    "in %s, without its categories, its line links to all articles alone",
    async (locale, name, href) => {
      const { barElement } = await setup({ locale });

      expect(linksOf(barElement())).toEqual([[name, href]]);
    }
  );

  test.each([
    ["streamed in", true],
    ["read already, in the first response", false],
  ])(
    "its line reads the catalog, then the category in none and the group in the store's order, %s",
    async (_case, streamed) => {
      const { bar, barElement } = await setup({
        categories: CATEGORIES,
        locale: "es",
        streamed,
      });

      // In the store's order, never a fixed one: the bubble guns come first
      // because their position does (FER-044).
      // Each entry by its first control: a link, or the group's button.
      expect(
        [...(barElement().querySelector("ul")?.children ?? [])].map(
          (item) => item.querySelector("a, button")?.textContent
        )
      ).toEqual(["Catálogo", "Burbujeros", "Bijouterie"]);
      // The group's page and categories wait behind its one control, out of
      // the reading order until it opens.
      expect(linksOf(barElement())).toEqual([
        ["Catálogo", "/productos"],
        ["Burbujeros", "/burbujeros"],
      ]);
      expect(bar().getByRole("button", { name: "Bijouterie" })).toHaveAttribute(
        "aria-expanded",
        "false"
      );
      expect(bar().getByRole("link", { name: "Burbujeros" })).toHaveAttribute(
        "lang",
        "es"
      );
    }
  );

  test("opens the group's categories from its button, each at its page under the group", async () => {
    const { bar, barElement, user } = await setup({
      categories: CATEGORIES,
      locale: "es",
    });

    await user.click(bar().getByRole("button", { name: "Bijouterie" }));

    expect(linksOf(barElement())).toEqual([
      ["Catálogo", "/productos"],
      ["Burbujeros", "/burbujeros"],
      ["Ver todo", "/bijouterie"],
      ["Cadenas", "/bijouterie/cadenas"],
      ["Anillos", "/bijouterie/anillos"],
      ["Aros", "/bijouterie/aros"],
      ["Pulseras", "/bijouterie/pulseras"],
    ]);
  });

  test("in English its links lead to the English pages, on the Spanish paths", async () => {
    const { bar } = await setup({
      categories: [{ ...makeCategory(3, "Rings", "anillos"), lang: "en" }],
    });

    expect(bar().getByRole("link", { name: "Rings" })).toHaveAttribute(
      "href",
      "/en/anillos"
    );
  });

  test(`holds at most ${BAR_CATEGORIES_MAX} entries on its line`, async () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      makeCategory(index + 1, `C${index}`, `c${index}`)
    );
    const { barElement } = await setup({ categories: many, locale: "es" });

    // "Catálogo" and the first five, in order; never the sixth.
    // Written out, so a limit raised by mistake goes red.
    expect(linksOf(barElement())).toEqual([
      ["Catálogo", "/productos"],
      ["C0", "/c0"],
      ["C1", "/c1"],
      ["C2", "/c2"],
      ["C3", "/c3"],
      ["C4", "/c4"],
    ]);
  });

  test("stops at the first entry whose name would not fit on the line", async () => {
    const { barElement } = await setup({
      categories: [
        makeCategory(1, "Collares de perlas", "collares"),
        makeCategory(2, "Pistolas de burbujas", "pistolas"),
        makeCategory(3, "Aros", "aros"),
      ],
      locale: "es",
    });

    // "Catálogo" (8) + 18 + 20 = 46 letters, past the 44 the line holds;
    // 8 + 18 = 26 fits.
    expect(linksOf(barElement()).map(([name]) => name)).toEqual([
      "Catálogo",
      "Collares de perlas",
    ]);
  });

  test.each([
    ["all articles", "/productos", "Catálogo"],
    ["a category in no group", "/burbujeros", "Burbujeros"],
  ])(
    "marks %s's link as the current page on it, and nothing else",
    async (_case, currentPath, name) => {
      const { bar } = await setup({
        categories: CATEGORIES,
        currentPath,
        locale: "es",
      });

      expect(
        bar()
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "page")
          .map((link) => link.textContent)
      ).toEqual([name]);
    }
  );

  test.each([
    ["the group's page", "/bijouterie", "Ver todo"],
    ["one of its categories", "/bijouterie/anillos", "Anillos"],
  ])(
    "on %s, marks its link inside the group as the current page and underlines the group",
    async (_case, currentPath, name) => {
      const { bar, user } = await setup({
        categories: CATEGORIES,
        currentPath,
        locale: "es",
      });
      const group = bar().getByRole("button", { name: "Bijouterie" });

      expect(group).toHaveAttribute("data-current", "true");
      await user.click(group);

      expect(
        bar()
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "page")
          .map((link) => link.textContent)
      ).toEqual([name]);
    }
  );

  test("marks nothing as current elsewhere", async () => {
    const { bar } = await setup({ categories: CATEGORIES, locale: "es" });

    expect(
      bar()
        .getAllByRole("link")
        .filter((link) => link.hasAttribute("aria-current"))
    ).toEqual([]);
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

  test("on a phone, the menu holds the logo home, all articles, the same entries and the language, the group unfolding to its categories", async () => {
    const { dialog, user } = await setup({
      categories: CATEGORIES,
      currentPath: "/productos",
      locale: "es",
    });

    await user.click(screen.getByRole("button", { name: "Menú" }));

    const menu = within(dialog());
    expect(linksOf(dialog())).toEqual([
      ["", "/"],
      ["Catálogo", "/productos"],
      ["Burbujeros", "/burbujeros"],
      ["Bijouterie", "/bijouterie"],
      ["English", "/en"],
    ]);
    expect(menu.getByRole("link", { name: "Catálogo" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await user.click(
      menu.getByRole("button", { name: "Bijouterie: sus categorías" })
    );

    expect(linksOf(dialog()).map(([name]) => name)).toEqual([
      "",
      "Catálogo",
      "Burbujeros",
      "Bijouterie",
      "Cadenas",
      "Anillos",
      "Aros",
      "Pulseras",
      "English",
    ]);
    expect(menu.getByRole("button", { name: "Cerrar el menú" })).toBeVisible();
  });

  test("on a phone without categories, the menu holds the logo home, all articles and the language", async () => {
    const { dialog, user } = await setup({ locale: "es" });

    await user.click(screen.getByRole("button", { name: "Menú" }));

    expect(
      within(dialog())
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/", "/productos", "/en"]);
  });

  test.each([
    ["es", "/", "LR Market, home"],
    ["en", "/en", "LR Market, home"],
  ] as const)(
    "in %s, the menu opens on the full logo, centered over the links, leading home at %s, named %j",
    async (locale, href, name) => {
      const { dialog, user } = await setup({ categories: CATEGORIES, locale });
      const copy = DICTIONARIES[locale].storefront.shell;

      await user.click(screen.getByRole("button", { name: copy.menu }));

      const home = within(dialog()).getByTestId("store-mobile-menu-home");
      expect(home).toHaveAccessibleName(name);
      expect(home).toHaveAttribute("href", href);
      // No "Home" among the links: the logo is the way home.
      expect(
        within(dialog()).queryByRole("link", { name: copy.home })
      ).toBeNull();
      const logo = required(home.querySelector('[data-slot="store-logo"]'));
      expect(logo).toHaveAttribute("data-variant", "full");
      expect(logo).toHaveAttribute("aria-hidden", "true");
      // First in the menu's navigation, centered, with room under it.
      const nav = within(dialog()).getByRole("navigation", {
        name: copy.navigation,
      });
      const holder = required(home.parentElement);
      expect(nav.firstElementChild).toBe(holder);
      expect(holder).toHaveClass("flex", "justify-center", "pb-8");
    }
  );

  test("following the menu's logo closes the menu", async () => {
    const { user } = await setup({ categories: CATEGORIES, locale: "es" });
    await user.click(screen.getByRole("button", { name: "Menú" }));

    await user.click(screen.getByTestId("store-mobile-menu-home"));

    await waitFor(() => {
      expect(screen.queryByTestId("store-mobile-menu")).toBeNull();
    });
  });

  test("the menu's language pill comes last, pushed to the panel's bottom-left corner", async () => {
    const { dialog, user } = await setup({
      categories: CATEGORIES,
      locale: "es",
    });
    await user.click(screen.getByRole("button", { name: "Menú" }));

    const pill = within(dialog()).getByRole("link", { name: "English" });
    // The panel's body is a column as tall as the panel: the pill's own
    // `mt-auto` takes the room left above it, `self-start` keeps it left.
    const body = required(pill.parentElement);
    expect(body.lastElementChild).toBe(pill);
    expect(body).toHaveClass("flex", "flex-1", "flex-col");
    expect(pill).toHaveClass("mt-auto", "self-start");
  });
});
