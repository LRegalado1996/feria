import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StoreTheme, type StoreThemePalette } from "./store-theme";

const WARM: StoreThemePalette = {
  accent: "#ff8a3d",
  background: "#fff4e6",
  contrast: "#3d1f47",
  foreground: "#26160f",
  surface: "#fffaf5",
};

function setup(palette: Partial<StoreThemePalette> = {}) {
  render(
    <StoreTheme
      className="pb-24"
      data-testid="theme"
      palette={{ ...WARM, ...palette }}
    >
      <p>Page content</p>
    </StoreTheme>
  );

  return { theme: screen.getByTestId("theme") };
}

/** The five custom properties the element declares, by token. */
function tokensOf(theme: HTMLElement) {
  return {
    accent: theme.style.getPropertyValue("--store-accent"),
    background: theme.style.getPropertyValue("--store-background"),
    contrast: theme.style.getPropertyValue("--store-contrast"),
    foreground: theme.style.getPropertyValue("--store-foreground"),
    surface: theme.style.getPropertyValue("--store-surface"),
  };
}

describe("StoreTheme", () => {
  test("writes each of the store's five colors over its own storefront token", () => {
    const { theme } = setup();

    expect(tokensOf(theme)).toEqual(WARM);
  });

  test("another palette gets its own values", () => {
    const { theme } = setup({ accent: "#c8f31d", surface: "#ffffff" });

    expect(tokensOf(theme)).toEqual({
      ...WARM,
      accent: "#c8f31d",
      surface: "#ffffff",
    });
  });

  test("marks the element so CSS derives the muted colors from this palette", () => {
    const { theme } = setup();

    expect(theme).toHaveAttribute("data-store-palette");
    expect(theme).toHaveAttribute("data-slot", "store-theme");
  });

  test("paints the page in the store's background and text color, around its content", () => {
    const { theme } = setup();

    expect(theme).toHaveClass(
      "min-h-screen",
      "bg-store-background",
      "text-store-foreground"
    );
    expect(theme).toContainElement(screen.getByText("Page content"));
  });

  test("keeps a caller's class", () => {
    const { theme } = setup();

    expect(theme).toHaveClass("pb-24", "min-h-screen");
  });
});
