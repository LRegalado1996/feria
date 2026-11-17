import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import { STORE_MAIN_ID, StoreHeader } from "./store-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function setup({ locale = "en" }: { locale?: Locale } = {}) {
  renderWithI18n(
    <StoreHeader
      className="custom"
      copy={DICTIONARIES[locale].storefront.shell}
      locale={locale}
    />,
    { locale }
  );

  return {
    header: screen.getByTestId("store-header"),
    home: screen.getByTestId("store-header-home"),
  };
}

describe("StoreHeader", () => {
  test.each([
    ["en", "/en"],
    ["es", "/"],
  ] as const)(
    "in %s, leads home at %s from the brand's mark, named after the brand",
    (locale, href) => {
      const { home } = setup({ locale });

      const logo = within(home).getByRole("img", { name: "LR Market" });
      expect(logo).toHaveAttribute("data-slot", "store-logo");
      expect(logo).toHaveAttribute("data-variant", "mark");
      expect(logo).toHaveClass("h-10");
      expect(home).toHaveAccessibleName("LR Market");
      expect(home).toHaveAttribute("href", href);
    }
  );

  test("starts with a skip link to the page's main content", () => {
    const { header } = setup();

    expect(STORE_MAIN_ID).toBe("store-main");
    const skip = within(header).getAllByRole("link")[0];
    expect(skip).toHaveAccessibleName("Skip to content");
    expect(skip).toHaveAttribute("href", "#store-main");
  });

  test.each([
    ["en", "Store sections", "Home", "/en", "Catalog", "/en/products"],
    ["es", "Secciones de la tienda", "Inicio", "/", "Catálogo", "/products"],
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
    expect(field.closest("form")).toHaveAttribute("action", "/en/products");
  });

  test("leads to the cart, and offers the language", () => {
    const { header } = setup({ locale: "es" });

    expect(within(header).getByTestId("store-cart-button")).toHaveAttribute(
      "href",
      "/cart"
    );
    expect(
      within(header).getByRole("link", { name: "English" })
    ).toHaveAttribute("href", "/en");
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
    // The language pill's text is its codes; its name is the language.
    expect(
      menu
        .getAllByRole("link")
        .map((link) => [
          link.dataset.slot === "locale-toggle"
            ? link.getAttribute("lang")
            : link.textContent,
          link.getAttribute("href"),
        ])
    ).toEqual([
      ["Inicio", "/"],
      ["Catálogo", "/products"],
      ["en", "/en"],
    ]);
    expect(menu.getByRole("link", { name: "English" })).toHaveAttribute(
      "href",
      "/en"
    );
    expect(
      menu.getByRole("searchbox", { name: "Buscar en la tienda" })
    ).toHaveAttribute("id", "store-search-menu");
    expect(menu.getByRole("button", { name: "Cerrar el menú" })).toBeVisible();
  });
});
