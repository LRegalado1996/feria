import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { StoreLocaleToggle } from "./store-locale-toggle";

vi.mock("next/navigation", () => ({
  usePathname: () => "/lr-market/products",
  useSearchParams: () => new URLSearchParams("q=aros"),
}));

function setup({ locale = "es" }: { locale?: Locale } = {}) {
  renderWithI18n(<StoreLocaleToggle className="self-start" />, { locale });

  return { link: screen.getByRole("link") };
}

describe("StoreLocaleToggle", () => {
  test("is the language link in the store's colors, keeping the store, path and query", () => {
    const { link } = setup();

    expect(link).toHaveAccessibleName("English");
    expect(link).toHaveAttribute("href", "/en/lr-market/products?q=aros");
    expect(link).toHaveClass(
      "text-store-foreground",
      "focus-visible:outline-store-foreground",
      "min-h-11",
      "self-start"
    );
  });

  test("brings none of the app's button: no icon, no button classes", () => {
    const { link } = setup({ locale: "en" });

    expect(link).toHaveAccessibleName("Español");
    expect(link.querySelector("svg")).toBeNull();
    expect(link).not.toHaveAttribute("data-variant");
    expect(link).not.toHaveClass("rounded-md");
  });
});
