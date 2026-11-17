import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type * as UiHooks from "@/lib/hooks/ui";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";

import {
  BAND_BUBBLES,
  BAND_MOTION_MS,
  StoreArticleBand,
} from "./store-article-band";

const { seen } = vi.hoisted(() => ({ seen: vi.fn(() => false) }));

// Whether the band has been half on screen: the hook has its own tests.
vi.mock("@/lib/hooks/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof UiHooks>()),
  useSeenOnce: () => [vi.fn(), seen()] as const,
}));

function setup({
  locale = "es",
  playing = false,
}: { locale?: Locale; playing?: boolean } = {}) {
  seen.mockReturnValue(playing);
  const words = Object.values(DICTIONARIES[locale].storefront.article.band);
  render(<StoreArticleBand words={words} />);
  const band = screen.getByTestId("store-article-band");

  return {
    band,
    bubbles: () => band.querySelectorAll('[data-slot="store-bubble"]'),
    lines: () => [
      ...band.querySelectorAll<HTMLElement>(
        '[data-slot="store-article-band-line"]'
      ),
    ],
    words,
  };
}

describe("StoreArticleBand", () => {
  test.each([
    [
      "es",
      ["LR Market", "Burbujas", "Bijou", "Feria Paseo Prado", "Puesto 86"],
    ],
    ["en", ["LR Market", "Bubbles", "Bijou", "Paseo Prado Fair", "Stall 86"]],
  ] as const)(
    "in %s, says the store's own words, three times on each of its two lines",
    (locale, expected) => {
      const { lines, words } = setup({ locale });

      expect(words).toEqual(expected);
      for (const line of lines()) {
        for (const word of expected) {
          expect(
            [...line.querySelectorAll("span")].filter(
              (span) => span.children.length === 0 && span.textContent === word
            )
          ).toHaveLength(3);
        }
      }
      expect(lines()).toHaveLength(2);
    }
  );

  test("is decoration: hidden from screen readers, with nothing to focus", () => {
    const { band } = setup({ playing: true });

    expect(band).toHaveAttribute("aria-hidden", "true");
    expect(band.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(
      0
    );
  });

  test("a moss band of a fixed height, the words in lime, the second line hollow", () => {
    const { band, lines } = setup();
    const [filled, hollow] = lines();

    expect(band).toHaveClass(
      "bg-store-contrast",
      "h-55",
      "md:h-80",
      "overflow-hidden"
    );
    expect(filled).toHaveClass("text-store-accent", "store-display-banner");
    expect(hollow).toHaveClass("store-text-outline");
    expect(hollow).not.toHaveClass("text-store-accent");
  });

  test("before it has been seen, holds still where it rests, without bubbles", () => {
    const { band, bubbles, lines } = setup({ playing: false });

    expect(band).toHaveAttribute("data-playing", "false");
    expect(bubbles()).toHaveLength(0);
    expect(lines().map((line) => line.style.transform)).toEqual([
      "translateX(-4%)",
      "translateX(-18%)",
    ]);
  });

  test("once seen, the lines drift each their own way and the bubbles rise, all only where motion is welcome", () => {
    const { bubbles, lines } = setup({ playing: true });

    for (const line of lines()) {
      expect(line).toHaveAttribute("data-playing", "true");
      expect(line).toHaveClass(
        "motion-safe:data-[playing=true]:animate-store-drift"
      );
    }
    const [filled, hollow] = lines();
    expect(filled?.style.getPropertyValue("--store-drift-to")).toBe("-14%");
    expect(hollow?.style.getPropertyValue("--store-drift-to")).toBe("-8%");
    expect(bubbles()).toHaveLength(BAND_BUBBLES.length);
    for (const bubble of bubbles()) {
      expect(bubble).toHaveClass("motion-safe:animate-store-bubble");
    }
    // Under reduced motion the layer is not drawn at all.
    expect(bubbles()[0]?.parentElement).toHaveClass("motion-reduce:hidden");
  });

  test("is still again within five seconds, so it needs no pause control", () => {
    const longestBubble = Math.max(
      ...BAND_BUBBLES.map((bubble) => bubble.delay + bubble.duration)
    );

    expect(BAND_MOTION_MS).toBeLessThan(5000);
    const { lines } = setup({ playing: true });
    for (const line of lines()) {
      expect(line.style.animationDuration).toBe(`${BAND_MOTION_MS}ms`);
    }
    expect(longestBubble).toBeLessThan(5000);
  });
});
