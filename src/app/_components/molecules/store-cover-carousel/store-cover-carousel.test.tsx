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
    image: { height: 800, url: `/seed/banner-${index}.jpg`, width: 1200 },
    title: `Portada ${index + 1}`,
  }));
}

function setup({
  api = true,
  banners,
  count = 3,
  headingLevel,
  locale = "es",
  reduced = false,
}: {
  api?: boolean;
  banners?: StoreCoverBanner[];
  count?: number;
  headingLevel?: "h2" | "h3";
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
    <StoreCoverCarousel
      banners={banners ?? makeBanners(count)}
      className="mt-0"
      headingLevel={headingLevel}
    />,
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
    [
      "es",
      "Portada",
      "de",
      "Comprar ahora",
      "Ver la portada 2",
      "Pausar la portada",
    ],
    ["en", "Cover", "of", "Shop now", "Show cover 2", "Pause the cover"],
  ] as const)(
    "in %s, several banners are one carousel named %j, a slide each, with a dot for each and a pause button",
    (locale, name, of, shopNow, second, pauseName) => {
      setup({ locale });

      const cover = screen.getByRole("region", { name });
      // Each slide's name, then its banner's words (its title, then the
      // call to shop) and where the banner leads.
      expect(
        within(cover)
          .getAllByRole("group")
          .map((slide) => {
            const banner = within(slide).getByRole("link");

            return [
              slide.getAttribute("aria-label"),
              banner.textContent,
              banner.getAttribute("href"),
            ];
          })
      ).toEqual([
        [`1 ${of} 3`, `Portada 1${shopNow}`, "/products?category=c0"],
        [`2 ${of} 3`, `Portada 2${shopNow}`, "/products?category=c1"],
        [`3 ${of} 3`, `Portada 3${shopNow}`, "/products?category=c2"],
      ]);
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
    expect(plugin.play).toHaveBeenCalledExactlyOnceWith();
    expect(plugin.stop).not.toHaveBeenCalled();
  });

  test("loads the first banner's photo first, the others lazily", () => {
    setup();

    const photos = [...document.querySelectorAll("img")];
    expect(photos.map((photo) => photo.getAttribute("loading"))).toEqual([
      "eager",
      "lazy",
      "lazy",
    ]);
    expect(photos[0]).toHaveAttribute("fetchpriority", "high");
    expect(photos[1]).not.toHaveAttribute("fetchpriority");
  });

  test.each([1, 3])(
    "with %i banner(s), each is as tall as the cover, nearly a screen, its title a heading at the level asked",
    (count) => {
      setup({ count, headingLevel: "h2" });

      const banners = [
        ...document.querySelectorAll<HTMLElement>('[data-slot="store-banner"]'),
      ];
      expect(banners.map((banner) => banner.dataset.size)).toEqual(
        Array.from({ length: count }, () => "cover")
      );
      expect(banners[0]).toHaveClass(
        "h-[calc(100svh-17.5rem)]",
        "md:h-[calc(100svh-20rem)]"
      );
      expect(
        screen
          .getAllByRole("heading", { level: 2 })
          .map((heading) => heading.textContent)
      ).toEqual(
        Array.from({ length: count }, (_, index) => `Portada ${index + 1}`)
      );
    }
  );

  test("shows a banner's phone crop on a phone, its own words in its language, and no button without a link", () => {
    setup({
      banners: [
        {
          href: "/bijouterie",
          id: "jewelry",
          image: { height: 800, url: "/seed/ring-3.jpg", width: 1200 },
          lang: "es",
          phoneImage: {
            height: 800,
            url: "/seed/ring-3-phone.jpg",
            width: 800,
          },
          shopNow: "Ver las joyas",
          title: "Joyas para regalar",
        },
        {
          href: null,
          id: "fair",
          image: { height: 800, url: "/seed/bubbles-1.jpg", width: 1200 },
          lang: "es",
          shopNow: null,
          title: "En la feria",
        },
      ],
      locale: "en",
    });

    const jewelry = screen.getByRole("link", {
      name: "Joyas para regalar Ver las joyas",
    });
    expect(jewelry.querySelector("img")?.getAttribute("src")).toContain(
      encodeURIComponent("/seed/ring-3-phone.jpg")
    );
    expect(jewelry.querySelector("source")?.getAttribute("srcset")).toContain(
      encodeURIComponent("/seed/ring-3.jpg")
    );
    expect(screen.getByText("Joyas para regalar")).toHaveAttribute(
      "lang",
      "es"
    );
    expect(screen.getByText("Ver las joyas")).toHaveAttribute("lang", "es");
    expect(screen.getAllByRole("link")).toEqual([jewelry]);
    expect(screen.getByText("En la feria")).toHaveAttribute("lang", "es");
  });

  test("a banner without words of its own takes the page's, in the page's language", () => {
    setup({
      banners: [
        {
          href: "/burbujeros",
          id: "bubbles",
          image: { height: 800, url: "/seed/bubbles-1.jpg", width: 1200 },
          lang: "es",
          shopNow: null,
          title: "Burbujeros",
        },
      ],
      locale: "en",
    });

    expect(screen.getByText("Shop now")).not.toHaveAttribute("lang");
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
    expect(plugin.stop).toHaveBeenCalledExactlyOnceWith();

    fireEvent.click(required(pause()));
    expect(pause()).toHaveAttribute("aria-pressed", "false");
    expect(plugin.play).toHaveBeenCalledExactlyOnceWith();
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
    expect(plugin.stop).toHaveBeenCalledExactlyOnceWith();

    fireEvent.mouseLeave(area);
    expect(plugin.play).toHaveBeenCalledExactlyOnceWith();
  });

  test("holds still while focus is inside it, even as it moves from control to control", () => {
    const { cover } = setup();
    const [first, second] = within(required(cover())).getAllByRole("button");
    plugin.play.mockClear();

    fireEvent.focus(required(first));
    expect(plugin.stop).toHaveBeenCalledExactlyOnceWith();
    fireEvent.blur(required(first), { relatedTarget: second });
    expect(plugin.play).not.toHaveBeenCalled();

    fireEvent.blur(required(second), { relatedTarget: document.body });
    expect(plugin.play).toHaveBeenCalledExactlyOnceWith();
  });

  test("holds still while a finger drags it", () => {
    const { embla } = setup();
    plugin.play.mockClear();

    act(() => {
      embla.emit("pointerDown");
    });
    expect(plugin.stop).toHaveBeenCalledExactlyOnceWith();

    act(() => {
      embla.emit("pointerUp");
    });
    expect(plugin.play).toHaveBeenCalledExactlyOnceWith();
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
    expect(plugin.stop).toHaveBeenCalledExactlyOnceWith();
    expect(pause()).toBeNull();
    expect(track()).toHaveAttribute("aria-live", "polite");
  });

  test("stops when the visitor turns on reduced motion", () => {
    const { motion } = setup();
    plugin.stop.mockClear();

    act(() => {
      motion.set(true);
    });

    expect(plugin.stop).toHaveBeenCalledExactlyOnceWith();
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
