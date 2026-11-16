import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import StoreNotFound from "./not-found";

const { useParams } = vi.hoisted(() => ({
  useParams: vi.fn(() => ({ store: "lr-market" })),
}));

vi.mock("next/navigation", () => ({ useParams }));

function setup({
  locale = "en",
  store = "lr-market",
}: { locale?: Locale; store?: string } = {}) {
  useParams.mockReturnValue({ store });
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
      "/en/lr-market",
    ],
    [
      "es",
      "No encontramos esta página",
      "Puede que el enlace sea viejo o que ese artículo ya no esté.",
      "Volver al inicio de la tienda",
      "/lr-market",
    ],
  ] as const)(
    "in %s, says the page is missing and leads back to the store's home",
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

  test("leads to the home of the store in the address", () => {
    const { home } = setup({ store: "tienda-demo" });

    expect(home).toHaveAttribute("href", "/en/tienda-demo");
  });
});
