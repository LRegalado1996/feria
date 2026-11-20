import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StoreBanner, type StoreBannerProps } from "./store-banner";

function setup(props: Partial<StoreBannerProps> = {}) {
  const { container } = render(
    <StoreBanner
      href="/products?category=burbujeros"
      shopNow="Comprar ahora"
      src="/seed/bubble-gun-1.jpg"
      title="Burbujas para toda la feria"
      {...props}
    />
  );

  return {
    banner: screen.getByRole("link"),
    photo: container.querySelector("img"),
  };
}

describe("StoreBanner", () => {
  test("is one link named by its title and its call to action", () => {
    const { banner } = setup();

    expect(banner).toHaveAccessibleName(
      "Burbujas para toda la feria Comprar ahora"
    );
    expect(banner).toHaveAttribute("href", "/products?category=burbujeros");
    expect(banner).toHaveAttribute("data-slot", "store-banner");
  });

  test("covers its box with the photo, which says nothing a screen reader would repeat", () => {
    const { photo } = setup();

    expect(photo).toHaveAttribute("alt", "");
    expect(photo?.getAttribute("src")).toContain("bubble-gun-1.jpg");
    expect(photo).toHaveClass("object-cover");
    expect(photo).toHaveAttribute("sizes", "100vw");
  });

  test("sets its title in the display face, at the banner's size", () => {
    setup();

    expect(screen.getByText("Burbujas para toda la feria")).toHaveClass(
      "font-display",
      "store-display-banner",
      "uppercase"
    );
  });

  test("loads its photo lazily unless it is the page's first", () => {
    const { photo } = setup();

    expect(photo).toHaveAttribute("loading", "lazy");
  });

  test("as the page's first, loads its photo first", () => {
    const { photo } = setup({ priority: true });

    expect(photo).not.toHaveAttribute("loading", "lazy");
  });

  test.each([null, undefined])(
    "without a link (%s), is the photo and its title, with no call to action (FER-020)",
    (href) => {
      const { container } = render(
        <StoreBanner
          href={href}
          shopNow="Comprar ahora"
          src="/seed/bubble-gun-1.jpg"
          title="Burbujas para toda la feria"
        />
      );

      const banner = container.querySelector('[data-slot="store-banner"]');
      expect(screen.queryByRole("link")).toBeNull();
      expect(banner?.tagName).toBe("DIV");
      expect(banner).toHaveTextContent(/^Burbujas para toda la feria$/u);
      expect(banner).toHaveClass("h-118", "relative");
    }
  );

  test("keeps a caller's class", () => {
    const { banner } = setup({ className: "h-100" });

    expect(banner).toHaveClass("h-100", "relative");
    expect(banner).not.toHaveClass("h-118");
  });
});
