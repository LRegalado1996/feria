import { screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import StoreNotFound from "./not-found";

// The frame's header reads the router (its search and language link).
vi.mock("next/navigation", () => ({
  usePathname: () => "/no-such-page",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function setup({ locale = "en" }: { locale?: Locale } = {}) {
  renderWithI18n(<StoreNotFound />, { locale });

  return {
    catalog: screen.getByTestId("store-not-found-catalog"),
    home: screen.getByTestId("store-not-found-home"),
  };
}

describe("StoreNotFound", () => {
  test("sits in the store's frame, under its header, with no bar: it reads nothing of the store", () => {
    setup({ locale: "es" });

    const frameMain = screen.getByTestId("store-main");
    expect(screen.getByTestId("store-header")).toBeVisible();
    expect(
      within(frameMain).getByRole("heading", { level: 1 })
    ).toHaveTextContent("Esta página no existe");
    expect(screen.queryByTestId("store-announcement-bar")).toBeNull();
  });

  test.each([
    [
      "en",
      "This page doesn't exist",
      "The link may be old, or that article may no longer be for sale. Everything we have is still in the catalog.",
      "See the catalog",
      "/en/productos",
      "Back to the store's home",
      "/en",
    ],
    [
      "es",
      "Esta página no existe",
      "Puede que el enlace sea viejo o que ese artículo ya no esté a la venta. Todo lo que tenemos sigue en el catálogo.",
      "Ver el catálogo",
      "/productos",
      "Volver a la home de la tienda",
      "/",
    ],
  ] as const)(
    "in %s, says the page does not exist and leads to the catalog and the home, the site's own",
    (locale, title, body, catalogName, catalogHref, back, homeHref) => {
      const { catalog, home } = setup({ locale });

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        new RegExp(`^${title}$`, "u")
      );
      expect(screen.getByText(body)).toBeVisible();
      expect(catalog).toHaveAccessibleName(catalogName);
      expect(catalog).toHaveAttribute("href", catalogHref);
      expect(home).toHaveAccessibleName(back);
      expect(home).toHaveAttribute("href", homeHref);
      expect(document.querySelector("title")).toHaveTextContent(
        new RegExp(`^${title}$`, "u")
      );
    }
  );
});
