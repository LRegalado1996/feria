import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  StoreChip,
  type StoreChipProps,
  storeChipVariants,
} from "./store-chip";

function setup(props: StoreChipProps = {}) {
  render(<StoreChip {...props}>{props.children ?? "Rings"}</StoreChip>);

  return { chip: screen.getByText("Rings") };
}

describe("StoreChip", () => {
  test("is an outlined label, tall enough for a thumb, when not selected", () => {
    const { chip } = setup();

    expect(chip.tagName).toBe("SPAN");
    expect(chip).toHaveAttribute("data-slot", "store-chip");
    expect(chip).toHaveAttribute("data-selected", "false");
    expect(chip).toHaveClass("min-h-11", "border", "text-store-foreground");
    expect(chip).not.toHaveClass("bg-store-foreground");
  });

  test("is filled when selected", () => {
    const { chip } = setup({ selected: true });

    expect(chip).toHaveAttribute("data-selected", "true");
    expect(chip).toHaveClass("bg-store-foreground", "text-store-background");
    expect(chip).not.toHaveClass("text-store-foreground");
  });

  test("with asChild styles the link that applies the filter, keeping its state", () => {
    const { chip } = setup({
      asChild: true,
      children: (
        <a aria-current="true" href="#rings">
          Rings
        </a>
      ),
      selected: true,
    });

    const link = screen.getByRole("link", { name: "Rings" });
    expect(link).toBe(chip);
    expect(link).toHaveAttribute("href", "#rings");
    expect(link).toHaveAttribute("aria-current", "true");
    expect(link).toHaveAttribute("data-slot", "store-chip");
    expect(link).toHaveClass("bg-store-foreground");
  });

  test("merges a caller's class over its own", () => {
    const { chip } = setup({ className: "px-6" });

    expect(chip).toHaveClass("px-6");
    expect(chip).not.toHaveClass("px-4");
  });

  test("exposes its variants", () => {
    expect(storeChipVariants({ selected: true })).toContain(
      "bg-store-foreground"
    );
    expect(storeChipVariants({ selected: false })).not.toContain(
      "bg-store-foreground"
    );
  });
});
