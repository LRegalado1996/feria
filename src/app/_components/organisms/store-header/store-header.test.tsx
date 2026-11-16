import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import { STORE_MAIN_ID, StoreHeader } from "./store-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/lr-market",
  useSearchParams: () => new URLSearchParams(),
}));

function makeStore(overrides: Partial<{ logoUrl: string | null }> = {}) {
  return { logoUrl: null, name: "LR Market", slug: "lr-market", ...overrides };
}

function setup({
  locale = "en",
  logoUrl = null,
}: { locale?: Locale; logoUrl?: string | null } = {}) {
  renderWithI18n(
    <StoreHeader
      className="custom"
      copy={DICTIONARIES[locale].storefront.shell}
      locale={locale}
      store={makeStore({ logoUrl })}
    />,
    { locale }
  );

  return {
    header: screen.getByTestId("store-header"),
    home: screen.getByTestId("store-header-home"),
  };
}

describe("StoreHeader", () => {
  test("shows the store's name on its home link when it has no logo", () => {
    const { home } = setup();

    expect(home).toHaveTextContent(/^LR Market$/u);
    expect(within(home).queryByRole("img")).toBeNull();
    expect(home).toHaveAttribute("href", "/en/lr-market");
  });

  test("shows the logo, named by the store, when it has one", () => {
    const { home } = setup({ logoUrl: "https://cdn.example.com/lr.png" });

    const logo = within(home).getByRole("img", { name: "LR Market" });
    expect(logo).toHaveAttribute("src", "https://cdn.example.com/lr.png");
    expect(home).toHaveAccessibleName("LR Market");
    expect(home).not.toHaveTextContent("LR Market");
  });

  test("starts with a skip link to the page's main content", () => {
    const { header } = setup();

    expect(STORE_MAIN_ID).toBe("store-main");
    const skip = within(header).getAllByRole("link")[0];
    expect(skip).toHaveAccessibleName("Skip to content");
    expect(skip).toHaveAttribute("href", "#store-main");
  });

  test.each([
    [
      "en",
      "Store sections",
      "Home",
      "/en/lr-market",
      "Catalog",
      "/en/lr-market/products",
    ],
    [
      "es",
      "Secciones de la tienda",
      "Inicio",
      "/lr-market",
      "Catálogo",
      "/lr-market/products",
    ],
  ] as const)(
    "in %s, links home and to the catalog",
    (locale, navigation, homeName, homeHref, catalogName, catalogHref) => {
      setup({ locale });

      const nav = within(screen.getByRole("navigation", { name: navigation }));
      expect(nav.getByRole("link", { name: homeName })).toHaveAttribute(
        "href",
        homeHref
      );
      expect(nav.getByRole("link", { name: catalogName })).toHaveAttribute(
        "href",
        catalogHref
      );
    }
  );

  test("searches from the header with its own field", () => {
    setup();

    const field = screen.getByRole("searchbox", { name: "Search the store" });
    expect(field).toHaveAttribute("id", "store-search");
    expect(field.closest("form")).toHaveAttribute(
      "action",
      "/en/lr-market/products"
    );
  });

  test("gives the cart the store, and offers the language", () => {
    const { header } = setup({ locale: "es" });

    expect(within(header).getByTestId("store-cart-button")).toHaveAttribute(
      "href",
      "/lr-market/cart"
    );
    expect(
      within(header).getByRole("link", { name: "English" })
    ).toHaveAttribute("href", "/en/lr-market");
  });

  test("is sticky and takes a className", () => {
    const { header } = setup();

    expect(header.tagName).toBe("HEADER");
    expect(header).toHaveClass("sticky", "custom");
    expect(header).toHaveAttribute("data-slot", "store-header");
  });

  test("on a phone, the menu holds the links, a search of its own and the language", async () => {
    setup({ locale: "es" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Menú" }));

    const menu = within(screen.getByRole("dialog", { name: "Menú" }));
    expect(
      menu
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["Inicio", "/lr-market"],
      ["Catálogo", "/lr-market/products"],
      ["English", "/en/lr-market"],
    ]);
    expect(
      menu.getByRole("searchbox", { name: "Buscar en la tienda" })
    ).toHaveAttribute("id", "store-search-menu");
    expect(menu.getByRole("button", { name: "Cerrar el menú" })).toBeVisible();
  });
});
