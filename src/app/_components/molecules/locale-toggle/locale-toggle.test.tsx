import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { LocaleToggle } from "./locale-toggle";

const { usePathname, useSearchParams } = vi.hoisted(() => ({
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({ usePathname, useSearchParams }));

function setup({
  locale = "es",
  pathname = "/",
  search = "",
}: { locale?: Locale; pathname?: string; search?: string } = {}) {
  usePathname.mockReturnValue(pathname);
  useSearchParams.mockReturnValue(new URLSearchParams(search));

  renderWithI18n(<LocaleToggle className="custom" />, { locale });

  return { link: screen.getByRole("link") };
}

describe("LocaleToggle", () => {
  test("on a Spanish page, is a link to English, named in English", () => {
    const { link } = setup({ locale: "es" });

    expect(link).toHaveTextContent("English");
    expect(link).toHaveAttribute("href", "/en");
    expect(link).toHaveAttribute("lang", "en");
    expect(link).toHaveAttribute("hreflang", "en");
    expect(link).toHaveAttribute("data-slot", "locale-toggle");
    expect(link).toHaveAttribute("data-testid", "locale-toggle");
    expect(link).toHaveClass("custom");
  });

  test("on an English page, is a link to Spanish, named in Spanish", () => {
    const { link } = setup({ locale: "en", pathname: "/en" });

    expect(link).toHaveTextContent("Español");
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveAttribute("lang", "es");
    expect(link).toHaveAttribute("hreflang", "es");
  });

  test.each([
    ["es", "/products", "", "/en/products"],
    ["en", "/en/products", "", "/products"],
    ["es", "/products/chain-1", "", "/en/products/chain-1"],
    // The query string survives the switch, in both directions.
    ["es", "/", "ref=qr", "/en?ref=qr"],
    ["en", "/en", "ref=qr", "/?ref=qr"],
    [
      "es",
      "/products",
      "category=collares&color=dorado",
      "/en/products?category=collares&color=dorado",
    ],
    [
      "en",
      "/en/products",
      "category=collares&color=dorado",
      "/products?category=collares&color=dorado",
    ],
    // The server renders a rewritten path (`/es/...`) where the browser has
    // the bare one: both lead to the same link, so hydration agrees.
    ["es", "/es/products", "color=dorado", "/en/products?color=dorado"],
    ["es", "/es", "", "/en"],
  ] as const)(
    "from the %s page %s with query %j leads to %s",
    (locale, pathname, search, href) => {
      const { link } = setup({ locale, pathname, search });

      expect(link).toHaveAttribute("href", href);
    }
  );

  test("its icon is decoration: the name is the language alone", () => {
    const { link } = setup();

    expect(link).toHaveAccessibleName("English");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
