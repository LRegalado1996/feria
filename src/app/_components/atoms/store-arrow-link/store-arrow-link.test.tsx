import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StoreArrowLink, type StoreArrowLinkProps } from "./store-arrow-link";

function setup(props: Partial<StoreArrowLinkProps> = {}) {
  render(
    <StoreArrowLink href="/en/articles" {...props}>
      See every article
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

    expect(link).toHaveAttribute("href", "/en/articles");
    expect(link).toHaveAccessibleName("See every article");
    expect(link).toHaveAttribute("data-slot", "store-arrow-link");
    expect(arrow).toHaveAttribute("aria-hidden", "true");
    expect(arrow?.querySelector("svg")).not.toBeNull();
  });

  test("is tall enough for a thumb and underlined, so it reads as a link without color", () => {
    const { link } = setup();

    expect(link).toHaveClass("min-h-11", "underline");
  });

  test("on the background, the arrow sits on a contrast box that takes the accent on hover", () => {
    const { arrow, link } = setup();

    expect(link).toHaveAttribute("data-tone", "default");
    expect(link).toHaveClass("text-store-foreground");
    expect(arrow).toHaveClass(
      "bg-store-contrast",
      "group-hover:bg-store-accent"
    );
  });

  test("on a contrast block, the text inverts and the box starts on the accent", () => {
    const { arrow, link } = setup({ tone: "contrast" });

    expect(link).toHaveAttribute("data-tone", "contrast");
    expect(link).toHaveClass("text-store-background");
    expect(link).not.toHaveClass("text-store-foreground");
    expect(arrow).toHaveClass("bg-store-accent");
    expect(arrow).not.toHaveClass("bg-store-contrast");
  });

  test("the arrow's nudge is dropped under reduced motion", () => {
    const { arrow } = setup();

    const icon = arrow?.querySelector("svg");

    expect(icon).toHaveClass(
      "motion-safe:group-hover:translate-x-1",
      "motion-safe:transition-transform"
    );
    // Ungated, it would still jump under reduced motion.
    expect(icon).not.toHaveClass("group-hover:translate-x-1");
  });

  test("keeps a caller's class", () => {
    const { link } = setup({ className: "mt-4" });

    expect(link).toHaveClass("mt-4", "underline");
  });
});
