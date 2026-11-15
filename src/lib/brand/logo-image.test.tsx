import type { ImageResponse } from "next/og";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";

import { type LogoImageOptions, renderLogoImage } from "./logo-image";
import { buildLogoDataUrl } from "./logo-svg";

// The real renderer rasterizes with WebAssembly; what is drawn and at which
// size is decided here, so the double keeps both for the assertions.
vi.mock("next/og", () => ({
  ImageResponse: class {
    readonly element: unknown;
    readonly options: unknown;

    constructor(element: unknown, options: unknown) {
      this.element = element;
      this.options = options;
    }
  },
}));

interface Captured {
  element: ReactElement<{
    children: ReactElement<Record<string, unknown>>;
    style: Record<string, unknown>;
  }>;
  options: unknown;
}

function isCaptured(value: Captured | ImageResponse): value is Captured {
  return "element" in value && isValidElement(value.element);
}

function setup(overrides: Partial<LogoImageOptions> = {}) {
  const response = renderLogoImage({
    background: "#111312",
    colorway: "accent",
    height: 630,
    logoWidth: 580,
    variant: "full",
    width: 1200,
    ...overrides,
  });

  if (!isCaptured(response)) {
    throw new Error("renderLogoImage did not build an ImageResponse");
  }

  const canvas = response.element.props;

  return { canvas, logo: canvas.children.props, options: response.options };
}

describe("renderLogoImage", () => {
  test("renders at the size it was asked for", () => {
    expect(setup({ height: 180, width: 180 }).options).toEqual({
      height: 180,
      width: 180,
    });
  });

  test("centers the logo on a canvas filled with the background", () => {
    expect(setup().canvas.style).toEqual({
      alignItems: "center",
      background: "#111312",
      display: "flex",
      height: "100%",
      justifyContent: "center",
      width: "100%",
    });
  });

  test("leaves the canvas transparent without a background", () => {
    expect(setup({ background: null }).canvas.style.background).toBe(
      "transparent"
    );
  });

  test("draws the brand's own SVG at the width asked for, in the drawing's proportions", () => {
    const { logo } = setup({
      colorway: "contrast",
      logoWidth: 580,
      variant: "mark",
    });

    expect(logo).toEqual({
      alt: "",
      // 580 wide in a 116 by 84 box.
      height: 420,
      src: buildLogoDataUrl({ colorway: "contrast", variant: "mark" }),
      width: 580,
    });
  });

  test("rounds the logo's height to a whole pixel", () => {
    // 32 * 84 / 116 = 23.17…
    expect(setup({ logoWidth: 32 }).logo.height).toBe(23);
  });
});
