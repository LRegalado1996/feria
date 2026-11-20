import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { required } from "@/test/required";

import { StoreBanner, type StoreBannerProps } from "./store-banner";

const COMPUTER = { height: 899, url: "/seed/bubble-gun-1.jpg", width: 1199 };
const PHONE = { height: 1067, url: "/seed/bubble-gun-2-phone.jpg", width: 854 };

function setup(props: Partial<StoreBannerProps> = {}) {
  const { container } = render(
    <StoreBanner
      href="/burbujeros"
      image={COMPUTER}
      shopNow="Comprar ahora"
      title="Burbujas para toda la feria"
      {...props}
    />
  );
  const root = required(
    container.querySelector<HTMLElement>('[data-slot="store-banner"]')
  );

  return {
    photo: required(root.querySelector("img")),
    root,
    sources: [...root.querySelectorAll("source")],
  };
}

describe("StoreBanner", () => {
  test("is one link named by its title and its call to action", () => {
    const { root } = setup();

    expect(screen.getByRole("link")).toBe(root);
    expect(root).toHaveAccessibleName(
      "Burbujas para toda la feria Comprar ahora"
    );
    expect(root).toHaveAttribute("href", "/burbujeros");
  });

  test("covers its box with the photo, which says nothing a screen reader would repeat", () => {
    const { photo } = setup();

    expect(photo).toHaveAttribute("alt", "");
    expect(photo.getAttribute("src")).toContain("bubble-gun-1.jpg");
    expect(photo).toHaveClass("object-cover", "size-full");
    expect(photo).toHaveAttribute("sizes", "100vw");
  });

  test("shows its phone crop below md and the computer's photo from md up (FER-022)", () => {
    const { photo, sources } = setup({ phoneImage: PHONE });

    expect(photo.getAttribute("src")).toContain(encodeURIComponent(PHONE.url));
    expect(sources.map((source) => source.getAttribute("media"))).toEqual([
      "(min-width: 768px)",
    ]);
    expect(sources[0]?.getAttribute("srcset")).toContain(
      encodeURIComponent(COMPUTER.url)
    );
  });

  test("without a phone crop, shows the computer's photo on a phone too", () => {
    const { photo, sources } = setup({ phoneImage: null });

    expect(sources).toEqual([]);
    expect(photo.getAttribute("src")).toContain(
      encodeURIComponent(COMPUTER.url)
    );
  });

  test("sets its title in the display face, at the banner's size, as plain text unless given a level", () => {
    setup();

    const title = screen.getByText("Burbujas para toda la feria");
    expect(title.tagName).toBe("P");
    expect(title).toHaveClass(
      "font-display",
      "store-display-banner",
      "uppercase"
    );
  });

  test.each(["h2", "h3"] as const)(
    "given %s, its title is a heading at that level, in the banner's language",
    (headingLevel) => {
      setup({ headingLevel, lang: "es" });

      const heading = screen.getByRole("heading", {
        level: Number(headingLevel.slice(1)),
        name: "Burbujas para toda la feria",
      });
      expect(heading).toHaveAttribute("lang", "es");
    }
  );

  test("marks its own button words with the banner's language, never the page's", () => {
    setup({ lang: "es", shopNow: "Ver las joyas", shopNowLang: "es" });

    expect(screen.getByText("Ver las joyas")).toHaveAttribute("lang", "es");
  });

  test("loads its photo lazily unless it is the page's first", () => {
    const { photo } = setup();

    expect(photo).toHaveAttribute("loading", "lazy");
    expect(photo).not.toHaveAttribute("fetchpriority");
  });

  test("as the page's first, loads its photo first", () => {
    const { photo } = setup({ priority: true });

    expect(photo).toHaveAttribute("loading", "eager");
    expect(photo).toHaveAttribute("fetchpriority", "high");
  });

  test.each([
    ["row", undefined, ["h-118", "md:h-130"]],
    ["row", "row", ["h-118", "md:h-130"]],
    [
      "cover",
      "cover",
      ["h-[calc(100svh-17.5rem)]", "md:h-[calc(100svh-20rem)]", "min-h-80"],
    ],
  ] as const)(
    "keeps its %s height before the photo arrives (size %s)",
    (name, size, classes) => {
      const { root } = setup({ size });

      expect(root).toHaveAttribute("data-size", name);
      expect(root).toHaveClass("relative", "w-full", ...classes);
    }
  );

  test.each([null, undefined])(
    "without a link (%s), is the photo and its title, with no call to action (FER-020)",
    (href) => {
      const { root } = setup({ href });

      expect(screen.queryByRole("link")).toBeNull();
      expect(root.tagName).toBe("DIV");
      expect(root).toHaveTextContent(/^Burbujas para toda la feria$/u);
      expect(root).toHaveClass("h-118", "relative");
      expect(root).toHaveAttribute("data-size", "row");
    }
  );

  test("keeps a caller's class", () => {
    const { root } = setup({ className: "h-100" });

    expect(root).toHaveClass("h-100", "relative");
    expect(root).not.toHaveClass("h-118");
  });
});
