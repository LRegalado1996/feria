import { readFileSync } from "node:fs";
import path from "node:path";

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type * as UiHooks from "@/lib/hooks/ui";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import {
  BAND_ICONS,
  BAND_PAUSED_KEY,
  BAND_STREAMERS,
  BAND_WAVES,
  StoreArticleBand,
} from "./store-article-band";

const { onScreen } = vi.hoisted(() => ({ onScreen: vi.fn(() => true) }));

// Whether the band is on screen: the hook has its own tests.
vi.mock("@/lib/hooks/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof UiHooks>()),
  useOnScreen: () => [vi.fn(), onScreen()] as const,
}));

afterEach(() => {
  window.sessionStorage.clear();
});

/** What holds every piece still while the band is not running. */
const HELD = "group-data-[running=false]/band:[animation-play-state:paused]!";

function setup({
  locale = "es",
  visible = true,
}: { locale?: Locale; visible?: boolean } = {}) {
  onScreen.mockReturnValue(visible);
  const copy = DICTIONARIES[locale].storefront.article;
  renderWithI18n(
    <StoreArticleBand
      greeting={copy.bandGreeting}
      pauseLabel={copy.bandPause}
    />,
    { locale }
  );
  const band = screen.getByTestId("store-article-band");
  const all = (slot: string) => [
    ...band.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`),
  ];

  return {
    band,
    icons: () => all("store-article-band-icon"),
    pause: () => within(band).getByRole("button"),
    picture: screen.getByTestId("store-article-band-picture"),
    streamers: () => all("store-article-band-streamer"),
    /** The sway inside each streamer: a second animation of its own. */
    sways: () => all("store-article-band-sway"),
    user: userEvent.setup(),
  };
}

describe("StoreArticleBand", () => {
  test.each([
    ["es", "¡Felices Fiestas!", "Pausar la animación"],
    ["en", "Happy Holidays!", "Pause the animation"],
  ] as const)(
    "in %s, greets %j in the middle, and names its pause %j",
    (locale, greeting, pause) => {
      const { pause: button, picture } = setup({ locale });

      expect(within(picture).getByText(greeting)).toHaveClass(
        "store-display-banner",
        "text-store-accent",
        "font-display"
      );
      expect(button()).toHaveAccessibleName(pause);
    }
  );

  test("the picture is decoration, and the pause button is the one thing a screen reader or a keyboard reaches", () => {
    const { band, pause, picture } = setup();

    expect(picture).toHaveAttribute("aria-hidden", "true");
    expect(band).not.toHaveAttribute("aria-hidden");
    expect(
      picture.querySelectorAll("a, button, input, [tabindex]")
    ).toHaveLength(0);
    expect(within(band).getAllByRole("button")).toEqual([pause()]);
    // 44 px, with the storefront's focus ring on the moss.
    expect(pause()).toHaveAttribute("data-size", "icon");
    expect(pause()).toHaveAttribute("data-variant", "contrast");
  });

  test("a moss band of a fixed height", () => {
    const { band } = setup();

    expect(band).toHaveClass(
      "bg-store-contrast",
      "h-55",
      "md:h-80",
      "overflow-hidden"
    );
  });

  test("three waves of streamers fall at three speeds, each wave as one line starting at its own point, four streamers each", () => {
    const { streamers } = setup();

    const durations = Object.values(BAND_WAVES).map((wave) => wave.duration);
    expect(new Set(durations).size).toBe(3);
    for (const wave of ["slow", "medium", "fast"] as const) {
      const line = streamers().filter((s) => s.dataset.wave === wave);
      expect(line).toHaveLength(4);
      // One wave, one timing: it reads as a line.
      expect(new Set(line.map((s) => s.style.animationDuration))).toEqual(
        new Set([`${BAND_WAVES[wave].duration}s`])
      );
      expect(new Set(line.map((s) => s.style.animationDelay)).size).toBe(1);
      for (const streamer of line) {
        expect(streamer).toHaveClass("motion-safe:animate-store-stream", HELD);
      }
    }
    expect(new Set(streamers().map((s) => s.style.animationDelay)).size).toBe(
      3
    );
  });

  test("a streamer falls at one steady speed, from out of sight above to out of sight below", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/styles/globals.css"),
      "utf-8"
    );
    const theme = /--animate-store-stream:([^;]+);/u.exec(css)?.[1] ?? "";
    const keyframes =
      /@keyframes store-stream \{([\s\S]*?)\n {2}\}/u.exec(css)?.[1] ?? "";

    expect(theme).toContain("linear");
    // Only the two ends move it: a stop in between would change its speed.
    expect(keyframes.match(/transform:/gu)).toHaveLength(2);
    expect(keyframes).toContain("translateY(-12%)");
    expect(keyframes).toContain("translateY(100%)");
  });

  test("on a phone, every wave keeps three streamers, and eight of the icons show", () => {
    const { icons, streamers } = setup();

    for (const wave of ["slow", "medium", "fast"] as const) {
      expect(
        streamers().filter(
          (s) =>
            s.dataset.wave === wave && !s.classList.contains("max-md:hidden")
        )
      ).toHaveLength(3);
    }
    expect(icons()).toHaveLength(BAND_ICONS.length);
    expect(BAND_ICONS.length).toBeGreaterThanOrEqual(12);
    expect(
      icons().filter(
        (icon) => !icon.parentElement?.classList.contains("max-md:hidden")
      )
    ).toHaveLength(8);
  });

  test("the streamers are thin curls, 1.25 px whatever their size", () => {
    const { streamers } = setup();

    for (const path of streamers().map((s) => s.querySelector("path"))) {
      expect(path?.closest("svg")).toHaveAttribute("stroke-width", "1.25");
      expect(path).toHaveAttribute("vector-effect", "non-scaling-stroke");
    }
    expect(BAND_STREAMERS).toHaveLength(12);
  });

  test("runs while it is on screen, and holds still off it", () => {
    expect(setup({ visible: true }).band).toHaveAttribute(
      "data-running",
      "true"
    );
  });

  test("off screen it holds still, with every piece paused where it is", () => {
    const { band, icons, streamers, sways } = setup({ visible: false });

    expect(band).toHaveAttribute("data-running", "false");
    for (const [pieces, animation] of [
      [streamers(), "motion-safe:animate-store-stream"],
      [sways(), "motion-safe:animate-store-sway"],
      [icons(), "motion-safe:animate-store-twinkle"],
    ] as const) {
      expect(pieces.length).toBeGreaterThan(0);
      for (const piece of pieces) {
        expect(piece).toHaveClass(animation, HELD);
      }
    }
  });

  test("the pause button holds it still and starts it again, and the choice is kept for the visit", async () => {
    const { band, pause, user } = setup();
    expect(pause()).toHaveAttribute("aria-pressed", "false");

    await user.click(pause());

    expect(pause()).toHaveAttribute("aria-pressed", "true");
    expect(band).toHaveAttribute("data-running", "false");
    expect(window.sessionStorage.getItem(BAND_PAUSED_KEY)).toBe("1");

    await user.click(pause());

    expect(band).toHaveAttribute("data-running", "true");
    expect(window.sessionStorage.getItem(BAND_PAUSED_KEY)).toBeNull();
  });

  test("under reduced motion nothing is animated and the button, with nothing to pause, is not shown", () => {
    const { icons, pause, picture, streamers, sways } = setup();
    const animations = (piece: Element) =>
      [...piece.classList].filter((name) => name.includes("animate-"));
    // Every animated piece of the picture, found by its classes, not by
    // its kind: a streamer, the sway inside it, an icon.
    const animated = [...picture.querySelectorAll("*")].filter(
      (piece) => animations(piece).length > 0
    );

    expect(new Set(animated)).toEqual(
      new Set([...streamers(), ...sways(), ...icons()])
    );
    expect(animated).toHaveLength(12 + 12 + 14);
    // Every animation only where motion is welcome; still, the streamers
    // rest around the greeting.
    for (const piece of animated) {
      expect(animations(piece)).toEqual(
        animations(piece).filter((name) =>
          name.startsWith("motion-safe:animate-")
        )
      );
    }
    expect(streamers()[0]?.style.transform).toBe(
      `translateY(${BAND_STREAMERS[0].top}%)`
    );
    expect(pause()).toHaveClass("motion-reduce:hidden");
  });
});
