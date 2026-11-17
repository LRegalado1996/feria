import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";

import { LocaleToggle, type LocaleToggleProps } from "./locale-toggle";

const { push, usePathname, useSearchParams } = vi.hoisted(() => ({
  push: vi.fn(),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  usePathname,
  useRouter: () => ({ push }),
  useSearchParams,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  push.mockReset();
});

function setup({
  classNames,
  locale = "es",
  pathname = "/",
  reducedMotion = false,
  search = "",
  tone,
}: {
  classNames?: LocaleToggleProps["classNames"];
  locale?: Locale;
  pathname?: string;
  reducedMotion?: boolean;
  search?: string;
  tone?: LocaleToggleProps["tone"];
} = {}) {
  usePathname.mockReturnValue(pathname);
  useSearchParams.mockReturnValue(new URLSearchParams(search));
  stubReducedMotion(reducedMotion);

  renderWithI18n(
    <LocaleToggle className="custom" classNames={classNames} tone={tone} />,
    { locale }
  );

  const link = screen.getByRole("link");
  const part = (slot: string) => {
    const element = link.querySelector(`[data-slot="${slot}"]`);

    if (!(element instanceof HTMLElement)) {
      throw new TypeError(`No ${slot} in the toggle`);
    }

    return element;
  };
  const codes = () =>
    [
      ...link.querySelectorAll<HTMLElement>('[data-slot="locale-toggle-code"]'),
    ].map((code) => [code.textContent, code.dataset.state]);

  return { codes, link, part, thumb: () => part("locale-toggle-thumb") };
}

describe("LocaleToggle", () => {
  test("on a Spanish page, is a link to English, named in English, with Spanish marked current", () => {
    const { codes, link, thumb } = setup({ locale: "es" });

    expect(link).toHaveAccessibleName("English");
    expect(link).toHaveAccessibleDescription("Idioma actual: español");
    expect(link).toHaveAttribute("href", "/en");
    expect(link).toHaveAttribute("lang", "en");
    expect(link).toHaveAttribute("hreflang", "en");
    expect(link).toHaveAttribute("data-slot", "locale-toggle");
    expect(link).toHaveAttribute("data-testid", "locale-toggle");
    expect(link).toHaveClass("custom");
    expect(codes()).toEqual([
      ["ES", "on"],
      ["EN", "off"],
    ]);
    expect(thumb()).toHaveAttribute("data-side", "start");
  });

  test("on an English page, is a link to Spanish, named in Spanish, with English marked current", () => {
    const { codes, link, thumb } = setup({ locale: "en", pathname: "/en" });

    expect(link).toHaveAccessibleName("Español");
    expect(link).toHaveAccessibleDescription("Current language: English");
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveAttribute("lang", "es");
    expect(link).toHaveAttribute("hreflang", "es");
    expect(codes()).toEqual([
      ["ES", "off"],
      ["EN", "on"],
    ]);
    expect(thumb()).toHaveAttribute("data-side", "end");
  });

  test.each(["es", "en"] as const)(
    "on a %s page, the description is in that language and the codes are for the eye alone",
    (locale) => {
      const { link, part } = setup({ locale });

      const description = document.querySelector(
        `[id="${link.getAttribute("aria-describedby") ?? ""}"]`
      );
      expect(description).toHaveAttribute("lang", locale);
      expect(description).not.toBeVisible();
      expect(part("locale-toggle-track")).toHaveAttribute(
        "aria-hidden",
        "true"
      );
    }
  );

  test.each([
    ["es", "/products", "", "/en/products"],
    ["en", "/en/products", "", "/products"],
    ["es", "/products/chain-1", "", "/en/products/chain-1"],
    // The query string survives the switch, in both directions.
    ["es", "/", "ref=qr", "/en?ref=qr"],
    ["en", "/en", "ref=qr", "/?ref=qr"],
    [
      "es",
      "/products",
      "category=collares&color=dorado",
      "/en/products?category=collares&color=dorado",
    ],
    [
      "en",
      "/en/products",
      "category=collares&color=dorado",
      "/products?category=collares&color=dorado",
    ],
    // The server renders a rewritten path (`/es/...`) where the browser has
    // the bare one: both lead to the same link, so hydration agrees.
    ["es", "/es/products", "color=dorado", "/en/products?color=dorado"],
    ["es", "/es", "", "/en"],
  ] as const)(
    "from the %s page %s with query %j leads to %s",
    (locale, pathname, search, href) => {
      const { link } = setup({ locale, pathname, search });

      expect(link).toHaveAttribute("href", href);
    }
  );

  test("pressed, the thumb slides to the other language first, then the page navigates", () => {
    vi.useFakeTimers();
    const { codes, link, thumb } = setup({
      pathname: "/products",
      search: "q=aros",
    });

    fireEvent.click(link);

    expect(thumb()).toHaveAttribute("data-side", "end");
    expect(codes()).toEqual([
      ["ES", "off"],
      ["EN", "on"],
    ]);
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(push).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(push).toHaveBeenCalledExactlyOnceWith("/en/products?q=aros");
  });

  test("a second press while the thumb crosses navigates only once", () => {
    vi.useFakeTimers();
    const { link } = setup();

    fireEvent.click(link);
    fireEvent.click(link);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(push).toHaveBeenCalledExactlyOnceWith("/en");
  });

  test("under reduced motion, the thumb does not slide and nothing waits", () => {
    vi.useFakeTimers();
    const { link, part, thumb } = setup({ reducedMotion: true });

    fireEvent.click(link);

    // Left to the link, which navigates at once: nothing is scheduled.
    expect(thumb()).toHaveAttribute("data-side", "start");
    expect(vi.getTimerCount()).toBe(0);
    expect(push).not.toHaveBeenCalled();
    // And in CSS, for a setting that changes after the press.
    expect(thumb()).toHaveClass("motion-reduce:transition-none");
    expect(part("locale-toggle-code")).toHaveClass(
      "motion-reduce:transition-none"
    );
  });

  test.each([
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ])("a press with %j is left to the browser, without sliding", (modifier) => {
    vi.useFakeTimers();
    const { link, thumb } = setup();

    const proceeded = fireEvent.click(link, modifier);

    expect(proceeded).toBe(true);
    expect(thumb()).toHaveAttribute("data-side", "start");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("with the app's tone, is a 44 px target on a phone in the app's tokens, focus shown on the capsule", () => {
    const { link, part, thumb } = setup();

    expect(link).toHaveAttribute("data-tone", "app");
    expect(link).toHaveClass("group", "h-11", "md:h-9", "outline-none");
    expect(part("locale-toggle-track")).toHaveClass(
      "rounded-full",
      "border",
      "bg-card",
      "group-focus-visible:ring-[3px]",
      "group-focus-visible:ring-ring/50"
    );
    expect(thumb()).toHaveClass("bg-foreground", "rounded-full");
    expect(part("locale-toggle-code")).toHaveClass(
      "data-[state=on]:text-background",
      "data-[state=off]:text-muted-foreground"
    );
  });

  test("bare, draws only the pill's shape and the classes it is given", () => {
    const { link, part, thumb } = setup({
      classNames: { code: "code-x", thumb: "thumb-x", track: "track-x" },
      tone: "bare",
    });

    expect(link).toHaveAttribute("data-tone", "bare");
    expect(link).not.toHaveClass("h-11");
    expect(part("locale-toggle-track")).toHaveClass("rounded-full", "track-x");
    expect(part("locale-toggle-track")).not.toHaveClass("bg-card");
    expect(part("locale-toggle-track")).not.toHaveClass("border");
    expect(thumb()).toHaveClass("thumb-x", "data-[side=end]:translate-x-full");
    expect(thumb()).not.toHaveClass("bg-foreground");
    expect(part("locale-toggle-code")).toHaveClass("code-x");
    expect(part("locale-toggle-code")).not.toHaveClass(
      "data-[state=on]:text-background"
    );
    expect(link).toHaveAccessibleName("English");
    expect(link).toHaveAttribute("lang", "en");
  });
});
