import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { StoreMarquee, type StoreMarqueeProps } from "./store-marquee";

const ITEMS = ["LR Market", "Christmas fair"] as const;

function setup({
  locale = "en",
  ...props
}: Partial<StoreMarqueeProps> & { locale?: Locale } = {}) {
  const user = userEvent.setup();
  const { container } = renderWithI18n(
    <StoreMarquee items={ITEMS} {...props} />,
    { locale }
  );
  const marquee = container.querySelector<HTMLElement>(
    '[data-slot="store-marquee"]'
  );
  const track = container.querySelector<HTMLElement>(
    '[data-slot="store-marquee-track"]'
  );
  const [first, second] = track ? [...track.children] : [];

  return {
    first,
    marquee,
    pause: screen.getByRole("button"),
    second,
    track,
    user,
  };
}

describe("StoreMarquee", () => {
  test("holds its phrases twice, the second copy hidden from assistive technology", () => {
    const { first, second } = setup();

    expect(first?.textContent).toBe("LR MarketChristmas fair");
    expect(second?.textContent).toBe("LR MarketChristmas fair");
    expect(first).not.toHaveAttribute("aria-hidden");
    expect(second).toHaveAttribute("aria-hidden", "true");
  });

  test("each copy fills the band, so a short list leaves no gap at the end of a lap", () => {
    const { first, second } = setup({ items: ["New"] });

    expect(first).toHaveClass("min-w-[100vw]", "motion-reduce:min-w-0");
    expect(second).toHaveClass("min-w-[100vw]");
  });

  test("separates phrases with a decorative icon", () => {
    const { first } = setup();

    const icons = [...(first?.querySelectorAll("svg") ?? [])];
    expect(icons.map((icon) => icon.getAttribute("aria-hidden"))).toEqual([
      "true",
      "true",
    ]);
  });

  test("moves only with motion allowed; under reduced motion it wraps in place with one copy", () => {
    const { first, second, track } = setup();

    expect(track).toHaveClass(
      "motion-safe:animate-store-marquee",
      "motion-reduce:w-full"
    );
    expect(first).toHaveClass("motion-reduce:flex-wrap");
    expect(second).toHaveClass("motion-reduce:hidden");
  });

  test.each([
    ["en", "Pause the moving band"],
    ["es", "Pausar la banda en movimiento"],
  ] as const)("in %s, its pause button is named %j", (locale, name) => {
    const { pause } = setup({ locale });

    expect(pause).toHaveAccessibleName(name);
  });

  test("runs until paused, and the button states which", async () => {
    const { marquee, pause, track, user } = setup();

    expect(pause).toHaveAttribute("aria-pressed", "false");
    expect(marquee).toHaveAttribute("data-paused", "false");
    expect(track).not.toHaveClass("[animation-play-state:paused]!");

    await user.click(pause);

    expect(pause).toHaveAttribute("aria-pressed", "true");
    expect(marquee).toHaveAttribute("data-paused", "true");
    expect(track).toHaveClass("[animation-play-state:paused]!");

    await user.click(pause);

    expect(pause).toHaveAttribute("aria-pressed", "false");
    expect(track).not.toHaveClass("[animation-play-state:paused]!");
  });

  test("has nothing to pause under reduced motion: the button goes away", () => {
    const { pause } = setup();

    expect(pause).toHaveClass("motion-reduce:hidden");
  });

  test("is a contrast band by default, with accent separators", () => {
    const { first, marquee, pause } = setup();

    expect(marquee).toHaveAttribute("data-tone", "contrast");
    expect(marquee).toHaveClass("bg-store-contrast", "text-store-background");
    expect(first?.querySelector("svg")).toHaveClass("text-store-accent");
    expect(pause).toHaveClass("bg-store-contrast");
  });

  test("the accent tone inverts it", () => {
    const { first, marquee, pause } = setup({ tone: "accent" });

    expect(marquee).toHaveAttribute("data-tone", "accent");
    expect(marquee).toHaveClass("bg-store-accent", "text-store-foreground");
    expect(marquee).not.toHaveClass("bg-store-contrast");
    expect(first?.querySelector("svg")).toHaveClass("text-store-foreground");
    expect(pause).toHaveClass("bg-store-accent");
  });

  test("keeps a caller's class", () => {
    const { marquee } = setup({ className: "my-8" });

    expect(marquee).toHaveClass("my-8", "overflow-x-clip");
  });
});
