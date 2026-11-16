import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StoreTheme } from "./store-theme";

function setup() {
  render(
    <StoreTheme className="pb-24" data-testid="theme">
      <p>Page content</p>
    </StoreTheme>
  );

  return { theme: screen.getByTestId("theme") };
}

describe("StoreTheme", () => {
  test("paints the page in the store's background and text color, around its content", () => {
    const { theme } = setup();

    expect(theme).toHaveClass(
      "min-h-screen",
      "bg-store-background",
      "text-store-foreground"
    );
    expect(theme).toHaveAttribute("data-slot", "store-theme");
    expect(theme).toContainElement(screen.getByText("Page content"));
  });

  test("declares no colors of its own: the theme file's, on <body>, reach it", () => {
    const { theme } = setup();

    expect(theme).not.toHaveAttribute("style");
    expect(theme).not.toHaveAttribute("data-store-palette");
  });

  test("keeps a caller's class", () => {
    const { theme } = setup();

    expect(theme).toHaveClass("pb-24", "min-h-screen");
  });
});
