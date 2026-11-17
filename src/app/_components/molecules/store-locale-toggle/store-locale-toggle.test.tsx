import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import {
  StoreLocaleToggle,
  type StoreLocaleToggleProps,
} from "./store-locale-toggle";

vi.mock("next/navigation", () => ({
  usePathname: () => "/products",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("q=aros"),
}));

function setup({
  locale = "es",
  tone,
}: { locale?: Locale; tone?: StoreLocaleToggleProps["tone"] } = {}) {
  renderWithI18n(<StoreLocaleToggle className="self-start" tone={tone} />, {
    locale,
  });

  const link = screen.getByRole("link");
  const part = (slot: string) =>
    link.querySelector(`[data-slot="locale-toggle-${slot}"]`);

  return {
    code: () => part("code"),
    link,
    thumb: () => part("thumb"),
    track: () => part("track"),
  };
}

describe("StoreLocaleToggle", () => {
  test.each([
    ["es", "English", "en", "/en/products?q=aros"],
    ["en", "Español", "es", "/products?q=aros"],
  ] as const)(
    "in %s, is the app's link to %s, keeping the path and the query",
    (locale, name, lang, href) => {
      const { link } = setup({ locale });

      expect(link).toHaveAccessibleName(name);
      expect(link).toHaveAttribute("lang", lang);
      expect(link).toHaveAttribute("href", href);
    }
  );

  test("is a 44 px target that brings none of the app's colors", () => {
    const { link, thumb, track } = setup();

    expect(link).toHaveAttribute("data-tone", "bare");
    expect(link).toHaveClass("min-h-11", "self-start");
    expect(track()).not.toHaveClass("bg-card");
    expect(thumb()).not.toHaveClass("bg-foreground");
  });

  test.each([
    [
      undefined,
      "border-store-foreground",
      "bg-store-foreground",
      "data-[state=on]:text-store-background",
      "data-[state=off]:text-store-foreground",
      "group-focus-visible:outline-store-foreground",
    ],
    [
      "contrast",
      "border-store-accent",
      "bg-store-accent",
      "data-[state=on]:text-store-foreground",
      "data-[state=off]:text-store-accent",
      "group-focus-visible:outline-store-accent",
    ],
  ] as const)(
    "with tone %s, a hairline capsule, a filled thumb and the codes read on each",
    (tone, hairline, fill, onThumb, offThumb, focus) => {
      const { code, thumb, track } = setup({ tone });

      expect(track()).toHaveClass(
        "border",
        hairline,
        "group-focus-visible:outline-3",
        focus
      );
      expect(thumb()).toHaveClass(fill);
      expect(code()).toHaveClass(onThumb, offThumb);
    }
  );
});
