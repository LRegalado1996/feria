import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createFakeEmbla } from "@/test/embla";
import { renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";
import { required } from "@/test/required";

import {
  COVER_DELAY_MS,
  type StoreCoverBanner,
  StoreCoverCarousel,
} from "./store-cover-carousel";

vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

const { plugin } = vi.hoisted(() => ({
  plugin: {
    name: "autoplay",
    play: vi.fn<() => void>(),
    stop: vi.fn<() => void>(),
  },
}));

vi.mock("embla-carousel-autoplay", () => ({ default: vi.fn(() => plugin) }));

function makeBanners(count: number): StoreCoverBanner[] {
  return Array.from({ length: count }, (_, index) => ({
    href: `/products?category=c${index}`,
    id: `banner-${index}`,
    src: `/seed/banner-${index}.jpg`,
    title: `Portada ${index + 1}`,
  }));
}

function setup({
  api = true,
  count = 3,
  locale = "es",
  reduced = false,
}: {
  api?: boolean;
  count?: number;
  locale?: Locale;
  reduced?: boolean;
} = {}) {
  const motion = stubReducedMotion(reduced);
  const embla = createFakeEmbla({
    plugins: { autoplay: plugin },
    snaps: count,
  });
  vi.mocked(useEmblaCarousel).mockReturnValue(
    api ? embla.hook : [embla.ref, undefined]
  );
  const view = renderWithI18n(
    <StoreCoverCarousel banners={makeBanners(count)} className="mt-0" />,
    { locale }
  );

  return {
    cover: () => screen.queryByRole("region", { name: /^(Portada|Cover)$/u }),
    embla,
    motion,
    pause: () => screen.queryByRole("button", { name: /^(Pausar|Pause)/u }),
    track: () =>
      document.querySelector<HTMLElement>('[data-slot="carousel-track"]'),
    user: userEvent.setup(),
    view,
  };
}

describe("StoreCoverCarousel", () => {
  test("with no banner, shows nothing", () => {
    const { view } = setup({ count: 0 });

    expect(view.container).toBeEmptyDOMElement();
  });

  test("one banner shows still, without controls or a carousel", () => {
    const { cover, pause } = setup({ count: 1 });

    expect(cover()).toBeNull();
    expect(pause()).toBeNull();
    const banner = screen.getByRole("link", {
      name: "Portada 1 Comprar ahora",
    });
    expect(banner).toHaveClass("mt-0");
    expect(banner.querySelector("img")).not.toHaveAttribute("loading", "lazy");
    expect(useEmblaCarousel).not.toHaveBeenCalled();
  });

  test.each([
    ["es", "Portada", "Ver la portada 2", "Pausar la portada"],
    ["en", "Cover", "Show cover 2", "Pause the cover"],
  ] as const)(
    "in %s, several banners are one carousel named %j, with a dot for each and a pause button",
    (locale, name, second, pauseName) => {
      setup({ locale });

      const cover = screen.getByRole("region", { name });
      expect(within(cover).getAllByRole("group")).toHaveLength(3);
      expect(within(cover).getAllByRole("link")).toHaveLength(3);
      expect(
        within(cover).getByRole("button", { name: second })
      ).not.toHaveAttribute("aria-current");
      expect(
        within(cover).getByRole("button", { name: pauseName })
      ).toHaveAttribute("aria-pressed", "false");
    }
  );

  test("loops, and moves on its own with the autoplay plugin, every few seconds", () => {
    setup();

    expect(Autoplay).toHaveBeenLastCalledWith({
      delay: COVER_DELAY_MS,
      playOnInit: false,
      stopOnFocusIn: false,
      stopOnInteraction: true,
      stopOnMouseEnter: false,
    });
    expect(useEmblaCarousel).toHaveBeenCalledWith({ loop: true }, [plugin]);
    expect(plugin.play).toHaveBeenCalledOnce();
    expect(plugin.stop).not.toHaveBeenCalled();
  });

  test("loads the first banner's photo first, the others lazily", () => {
    setup();

    const photos = document.querySelectorAll("img");
    expect(photos[0]).not.toHaveAttribute("loading", "lazy");
    expect(photos[1]).toHaveAttribute("loading", "lazy");
  });

  test("its banners are not announced while it rotates, and politely once it is paused", async () => {
    const { pause, track, user } = setup();

    expect(track()).toHaveAttribute("aria-live", "off");

    await user.click(required(pause()));

    expect(track()).toHaveAttribute("aria-live", "polite");
  });

  test("its pause button stops it, says so, and starts it again", () => {
    const { pause } = setup();
    plugin.play.mockClear();

    // A click alone: no pointer over it, no focus in it, to hold it too.
    fireEvent.click(required(pause()));
    expect(pause()).toHaveAttribute("aria-pressed", "true");
    expect(plugin.stop).toHaveBeenCalledOnce();

    fireEvent.click(required(pause()));
    expect(pause()).toHaveAttribute("aria-pressed", "false");
    expect(plugin.play).toHaveBeenCalledOnce();
  });

  test("once paused, leaving it with the pointer or the keyboard keeps it paused", () => {
    const { cover, pause } = setup();
    const area = required(cover()?.firstElementChild);
    fireEvent.click(required(pause()));
    plugin.play.mockClear();

    fireEvent.mouseEnter(area);
    fireEvent.mouseLeave(area);
    fireEvent.focus(required(pause()));
    fireEvent.blur(required(pause()), { relatedTarget: document.body });

    expect(plugin.play).not.toHaveBeenCalled();
  });

  test("holds still while hovered, and moves again when the pointer leaves", () => {
    const { cover } = setup();
    const area = required(cover()?.firstElementChild);
    plugin.play.mockClear();

    fireEvent.mouseEnter(area);
    expect(plugin.stop).toHaveBeenCalledOnce();

    fireEvent.mouseLeave(area);
    expect(plugin.play).toHaveBeenCalledOnce();
  });

  test("holds still while focus is inside it, even as it moves from control to control", () => {
    const { cover } = setup();
    const [first, second] = within(required(cover())).getAllByRole("button");
    plugin.play.mockClear();

    fireEvent.focus(required(first));
    expect(plugin.stop).toHaveBeenCalledOnce();
    fireEvent.blur(required(first), { relatedTarget: second });
    expect(plugin.play).not.toHaveBeenCalled();

    fireEvent.blur(required(second), { relatedTarget: document.body });
    expect(plugin.play).toHaveBeenCalledOnce();
  });

  test("holds still while a finger drags it", () => {
    const { embla } = setup();
    plugin.play.mockClear();

    act(() => {
      embla.emit("pointerDown");
    });
    expect(plugin.stop).toHaveBeenCalledOnce();

    act(() => {
      embla.emit("pointerUp");
    });
    expect(plugin.play).toHaveBeenCalledOnce();
  });

  // Embla measures again on a resize, and starts its plugins anew, stopped.
  test("plays again once Embla has measured again after a resize", () => {
    const { embla } = setup();
    plugin.play.mockClear();

    act(() => {
      embla.resize(3);
    });

    expect(plugin.play).toHaveBeenCalledExactlyOnceWith();
  });

  test("stays still after a resize while it is paused", () => {
    const { embla, pause } = setup();
    fireEvent.click(required(pause()));
    plugin.play.mockClear();

    act(() => {
      embla.resize(3);
    });

    expect(plugin.play).not.toHaveBeenCalled();
  });

  test("a dot shows its banner, and the dot of the banner shown is marked", async () => {
    const { embla, user } = setup();

    await user.click(screen.getByRole("button", { name: "Ver la portada 3" }));

    expect(embla.fake.scrollTo).toHaveBeenCalledExactlyOnceWith(2, false);
    expect(
      screen.getByRole("button", { name: "Ver la portada 3" })
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("button", { name: "Ver la portada 1" })
    ).not.toHaveAttribute("aria-current");
  });

  test("never moves under reduced motion, and offers no pause button", () => {
    const { pause, track } = setup({ reduced: true });

    expect(plugin.play).not.toHaveBeenCalled();
    expect(plugin.stop).toHaveBeenCalledOnce();
    expect(pause()).toBeNull();
    expect(track()).toHaveAttribute("aria-live", "polite");
  });

  test("stops when the visitor turns on reduced motion", () => {
    const { motion } = setup();
    plugin.stop.mockClear();

    act(() => {
      motion.set(true);
    });

    expect(plugin.stop).toHaveBeenCalledOnce();
  });

  test("before Embla is ready, asks the plugin for nothing", () => {
    setup({ api: false });

    expect(plugin.play).not.toHaveBeenCalled();
    expect(plugin.stop).not.toHaveBeenCalled();
  });

  test("lets go of Embla's events when it unmounts", () => {
    const { embla, view } = setup();

    view.unmount();

    expect(embla.listenerCount()).toBe(0);
  });
});
