import { screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { FAIR_OPENS_AT } from "@/lib/brand/fair";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { stubReducedMotion } from "@/test/reduced-motion";

import { StoreFairCountdown } from "./store-fair-countdown";

const { connection } = vi.hoisted(() => ({
  connection: vi.fn(async () => {
    await Promise.resolve();
  }),
}));

vi.mock("next/server", () => ({ connection }));

const THREE_WEEKS_BEFORE = "2026-11-14T15:00:00.000Z";

async function setup({
  locale = "en",
  now = THREE_WEEKS_BEFORE,
  opensAt = FAIR_OPENS_AT,
}: { locale?: Locale; now?: string; opensAt?: Date } = {}) {
  vi.setSystemTime(new Date(now));
  stubIntersectionObserver();
  stubReducedMotion(false);

  renderWithI18n(
    <div>
      {await StoreFairCountdown({
        className: "min-h-24",
        copy: DICTIONARIES[locale].comingSoon.countdown,
        opensAt,
      })}
    </div>,
    { locale }
  );

  const countdown = screen.queryByTestId("fair-countdown");
  const count = countdown?.querySelector('[data-slot="store-count-up"]');

  return {
    countdown,
    count,
    // The figure a screen reader gets; the running digits are decoration.
    figure: count?.firstElementChild?.textContent,
    label: countdown?.lastElementChild?.textContent,
  };
}

describe("StoreFairCountdown", () => {
  test.each([
    ["en", "days until the fair"],
    ["es", "días para la feria"],
  ] as const)(
    "in %s, three weeks before, counts 21 days after reading the request's clock",
    async (locale, expected) => {
      const { count, countdown, figure, label } = await setup({ locale });

      expect(connection).toHaveBeenCalledExactlyOnceWith();
      expect(figure).toBe("21");
      expect(label).toBe(expected);
      expect(count).toHaveClass(
        "font-display",
        "font-extrabold",
        "store-display-figure",
        "text-store-accent"
      );
      expect(count).not.toHaveClass("tracking-display");
      expect(countdown).toHaveAttribute("data-slot", "store-fair-countdown");
      expect(countdown).toHaveClass("min-h-24", "flex");
    }
  );

  test.each([
    ["two days before, to the millisecond", "2026-12-03T03:00:00.000Z", "2"],
    ["a millisecond past that", "2026-12-03T03:00:00.001Z", "2"],
    ["a millisecond more than a day before", "2026-12-04T02:59:59.999Z", "2"],
  ])("%s, it is plural", async (_name, now, expected) => {
    const { figure, label } = await setup({ now });

    expect(figure).toBe(expected);
    expect(label).toBe("days until the fair");
  });

  test.each([
    ["exactly a day before", "2026-12-04T03:00:00.000Z"],
    ["the evening before", "2026-12-04T23:00:00.000Z"],
    ["a millisecond before the opening", "2026-12-05T02:59:59.999Z"],
  ])("%s, it is one day, in the singular", async (_name, now) => {
    const { figure, label } = await setup({ now });

    expect(figure).toBe("1");
    expect(label).toBe("day until the fair");
  });

  test.each([
    ["at the opening", "2026-12-05T03:00:00.000Z"],
    ["during the fair", "2026-12-20T12:00:00.000Z"],
  ])(
    "%s, there is nothing to count and nothing is rendered",
    async (_name, now) => {
      const { countdown } = await setup({ now });

      expect(countdown).not.toBeInTheDocument();
    }
  );

  test("counts to the day it is given, not to the fair", async () => {
    const { figure, label } = await setup({
      now: THREE_WEEKS_BEFORE,
      opensAt: new Date("2026-11-17T03:00:00.000Z"),
    });

    expect(figure).toBe("3");
    expect(label).toBe("days until the fair");
  });
});
