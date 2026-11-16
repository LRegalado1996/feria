import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import StoreNotFound from "./not-found";

function setup({ locale = "en" }: { locale?: Locale } = {}) {
  renderWithI18n(<StoreNotFound />, { locale });

  return { home: screen.getByTestId("store-not-found-home") };
}

describe("StoreNotFound", () => {
  test.each([
    [
      "en",
      "We could not find this page",
      "The link may be old, or that article may be gone.",
      "Back to the store's home",
      "/en",
    ],
    [
      "es",
      "No encontramos esta página",
      "Puede que el enlace sea viejo o que ese artículo ya no esté.",
      "Volver al inicio de la tienda",
      "/",
    ],
  ] as const)(
    "in %s, says the page is missing and leads back to the store's home, the site's own",
    (locale, title, body, back, href) => {
      const { home } = setup({ locale });

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        new RegExp(`^${title}$`, "u")
      );
      expect(screen.getByText(body)).toBeVisible();
      expect(home).toHaveAccessibleName(back);
      expect(home).toHaveAttribute("href", href);
      expect(document.querySelector("title")).toHaveTextContent(
        new RegExp(`^${title}$`, "u")
      );
    }
  );
});
