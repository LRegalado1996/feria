import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  StoreEyebrow,
  type StoreEyebrowProps,
  storeEyebrowVariants,
} from "./store-eyebrow";

function setup(props: StoreEyebrowProps = {}) {
  render(<StoreEyebrow {...props}>Christmas fair</StoreEyebrow>);

  return { eyebrow: screen.getByText("Christmas fair") };
}

describe("StoreEyebrow", () => {
  test("is a small paragraph in the display face, muted on the background", () => {
    const { eyebrow } = setup();

    expect(eyebrow.tagName).toBe("P");
    expect(eyebrow).toHaveAttribute("data-slot", "store-eyebrow");
    expect(eyebrow).toHaveAttribute("data-tone", "default");
    expect(eyebrow).toHaveClass(
      "font-display",
      "font-extrabold",
      "uppercase",
      "text-xs",
      "text-store-muted"
    );
    expect(eyebrow).not.toHaveClass("text-store-contrast-muted");
  });

  test("on a contrast block takes the muted color that reads there", () => {
    const { eyebrow } = setup({ tone: "contrast" });

    expect(eyebrow).toHaveAttribute("data-tone", "contrast");
    expect(eyebrow).toHaveClass("text-store-contrast-muted");
    expect(eyebrow).not.toHaveClass("text-store-muted");
  });

  test("keeps a caller's class and attributes", () => {
    const { eyebrow } = setup({ className: "mb-2", id: "fair" });

    expect(eyebrow).toHaveClass("mb-2", "font-display");
    expect(eyebrow).toHaveAttribute("id", "fair");
  });

  test("exposes its tones", () => {
    expect(storeEyebrowVariants({ tone: "contrast" })).toContain(
      "text-store-contrast-muted"
    );
  });
});
