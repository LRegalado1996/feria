import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  StoreArrowLink,
  type StoreArrowLinkProps,
  storeArrowLinkVariants,
} from "./store-arrow-link";

function setup(props: Partial<StoreArrowLinkProps> = {}) {
  render(
    <StoreArrowLink href="/en/products" {...props}>
      Shop now
    </StoreArrowLink>
  );
  const link = screen.getByRole("link");

  return {
    arrow: link.querySelector('[data-slot="store-arrow-link-arrow"]'),
    link,
  };
}

describe("StoreArrowLink", () => {
  test("is a link to its href, named by its text alone", () => {
    const { arrow, link } = setup();

    expect(link).toHaveAttribute("href", "/en/products");
    expect(link).toHaveAccessibleName("Shop now");
    expect(link).toHaveAttribute("data-slot", "store-arrow-link");
    expect(arrow?.tagName.toLowerCase()).toBe("svg");
    expect(arrow).toHaveAttribute("aria-hidden", "true");
  });

  test("is set in the display face, tall enough for a thumb, underlined on hover", () => {
    const { link } = setup();

    expect(link).toHaveClass(
      "font-display",
      "font-extrabold",
      "uppercase",
      "min-h-11",
      "hover:underline"
    );
  });

  test("on the page it is the foreground, with a ring in the foreground", () => {
    const { link } = setup();

    expect(link).toHaveAttribute("data-tone", "default");
    expect(link).toHaveClass(
      "text-store-foreground",
      "focus-visible:outline-store-foreground"
    );
    expect(link).not.toHaveClass("text-store-accent");
  });

  test("on a contrast block it is the accent, with a ring in the accent", () => {
    const { link } = setup({ tone: "contrast" });

    expect(link).toHaveAttribute("data-tone", "contrast");
    expect(link).toHaveClass(
      "text-store-accent",
      "focus-visible:outline-store-accent"
    );
    expect(link).not.toHaveClass("text-store-foreground");
  });

  test("the arrow's nudge is dropped under reduced motion", () => {
    const { arrow } = setup();

    expect(arrow).toHaveClass(
      "motion-safe:group-hover:translate-x-1",
      "motion-safe:transition-transform"
    );
    // Ungated, it would still jump under reduced motion.
    expect(arrow).not.toHaveClass("group-hover:translate-x-1");
  });

  test("keeps a caller's class and passes the link's own attributes", () => {
    const { link } = setup({
      className: "mt-4",
      rel: "noopener noreferrer",
      target: "_blank",
    });

    expect(link).toHaveClass("mt-4", "font-display");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("exposes its tones", () => {
    expect(storeArrowLinkVariants({ tone: "contrast" })).toContain(
      "text-store-accent"
    );
  });
});
