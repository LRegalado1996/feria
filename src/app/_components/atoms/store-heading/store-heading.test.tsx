import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StoreHeading, type StoreHeadingProps } from "./store-heading";

const LINES = ["See you", "at the fair"] as const;

function setup(props: Partial<StoreHeadingProps> = {}) {
  render(<StoreHeading lines={LINES} {...props} />);
  const heading = screen.getByRole("heading");

  return {
    heading,
    lineTexts: [
      ...heading.querySelectorAll<HTMLElement>(
        '[data-slot="store-heading-line-text"]'
      ),
    ],
  };
}

describe("StoreHeading", () => {
  test("is an h2 in the display face at the section size by default", () => {
    const { heading } = setup();

    expect(heading.tagName).toBe("H2");
    expect(heading).toHaveAttribute("data-slot", "store-heading");
    expect(heading).toHaveAttribute("data-size", "section");
    expect(heading).toHaveClass(
      "font-display",
      "uppercase",
      "leading-display",
      "store-display-section"
    );
  });

  test.each([
    ["hero", "store-display-hero"],
    ["title", "store-display-title"],
  ] as const)("the %s size carries %s", (size, expected) => {
    const { heading } = setup({ size });

    expect(heading).toHaveAttribute("data-size", size);
    expect(heading).toHaveClass(expected);
    expect(heading).not.toHaveClass("store-display-section");
  });

  test.each([
    ["h1", 1],
    ["h3", 3],
  ] as const)("as %s it sits at level %i of the outline", (as, level) => {
    setup({ as });

    expect(screen.getByRole("heading", { level })).toHaveTextContent(
      "See you at the fair"
    );
  });

  test("reads as one sentence: the lines are separated by a space", () => {
    const { heading } = setup();

    expect(heading.textContent).toBe("See you at the fair");
    expect(heading).toHaveAccessibleName("See you at the fair");
  });

  test("puts each line in its own mask, rising a beat after the one above", () => {
    const { heading, lineTexts } = setup();

    expect(lineTexts.map((line) => line.textContent)).toEqual([...LINES]);
    expect(lineTexts.map((line) => line.style.animationDelay)).toEqual([
      "0ms",
      "80ms",
    ]);
    for (const line of lineTexts) {
      // Only with motion allowed: reduced motion shows the line in place.
      expect(line).toHaveClass("motion-safe:animate-store-line");
      expect(line.parentElement).toHaveClass("overflow-y-clip");
      expect(line.parentElement?.parentElement).toBe(heading);
    }
  });

  test("sets only the accent line in the accent color", () => {
    const { lineTexts } = setup({ accentLine: 1 });

    expect(lineTexts[0]).not.toHaveClass("text-store-accent");
    expect(lineTexts[1]).toHaveClass("text-store-accent");
  });

  test("has no accent line unless asked", () => {
    const { lineTexts } = setup();

    expect(
      lineTexts.filter((line) => line.classList.contains("text-store-accent"))
    ).toEqual([]);
  });

  test("keeps a caller's class and attributes", () => {
    const { heading } = setup({ className: "text-store-background", id: "x" });

    expect(heading).toHaveClass("text-store-background", "font-display");
    expect(heading).toHaveAttribute("id", "x");
  });
});
